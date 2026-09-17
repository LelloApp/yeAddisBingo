-- Migration: Section-Specific Daily Super Bonus System
-- Each game section (5, 10, 15, 20, 50, 100 ETB) is evaluated independently:
-- 1. Criteria: >= 24 finished games and >= 10 distinct winning candidates in that section today (GMT+3).
-- 2. Representation: Each candidate user represented only once per section draw.
-- 3. Prize Tiers:
--    - 5 ETB section   -> 500 ETB Mega Bonus
--    - 10 ETB section  -> 1,000 ETB Mega Bonus
--    - 15 ETB section  -> 1,500 ETB Mega Bonus
--    - 20 ETB section  -> 2,000 ETB Mega Bonus
--    - 50 ETB section  -> 5,000 ETB Mega Bonus
--    - 100 ETB section -> 10,000 ETB Mega Bonus
-- 4. Balance: Added to deposited_balance to maintain gameplay liquidity.

-- 1. Alter daily_super_bonuses to support per-section tracking
ALTER TABLE daily_super_bonuses
  ADD COLUMN IF NOT EXISTS room_slug text NOT NULL DEFAULT 'starter_room',
  ADD COLUMN IF NOT EXISTS room_stake integer NOT NULL DEFAULT 10;

-- Drop old single-date unique constraint if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'daily_super_bonuses_draw_date_key'
  ) THEN
    ALTER TABLE daily_super_bonuses DROP CONSTRAINT daily_super_bonuses_draw_date_key;
  END IF;
END $$;

-- Enforce unique constraint per section per day
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'daily_super_bonuses_date_room_key'
  ) THEN
    ALTER TABLE daily_super_bonuses
      ADD CONSTRAINT daily_super_bonuses_date_room_key UNIQUE (draw_date, room_slug);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_daily_super_bonuses_room ON daily_super_bonuses(draw_date, room_slug);

-- 2. Enhanced draw_daily_super_bonus supporting per-section evaluation
CREATE OR REPLACE FUNCTION draw_daily_super_bonus(
  p_date date DEFAULT NULL,
  p_room_slug text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_draw_date date;
  v_room RECORD;
  v_section_games integer;
  v_section_candidates integer;
  v_candidate RECORD;
  v_bonus RECORD;
  v_bonus_amount integer;
  v_results jsonb := '[]'::jsonb;
  v_section_result jsonb;
BEGIN
  -- Default to today in GMT+3 (East Africa Time)
  IF p_date IS NULL THEN
    v_draw_date := DATE(now() AT TIME ZONE 'UTC' + interval '3 hours');
  ELSE
    v_draw_date := p_date;
  END IF;

  -- Iterate through active rooms (or single room if specified)
  FOR v_room IN
    SELECT id, slug, title, stake_amount
    FROM bingo_rooms
    WHERE is_active = true
      AND (p_room_slug IS NULL OR slug = p_room_slug OR id = p_room_slug)
    ORDER BY stake_amount ASC
  LOOP
    -- Calculate bonus amount based on section stake
    IF v_room.stake_amount <= 5 THEN
      v_bonus_amount := 500;
    ELSIF v_room.stake_amount <= 10 THEN
      v_bonus_amount := 1000;
    ELSIF v_room.stake_amount <= 15 THEN
      v_bonus_amount := 1500;
    ELSIF v_room.stake_amount <= 20 THEN
      v_bonus_amount := 2000;
    ELSIF v_room.stake_amount <= 50 THEN
      v_bonus_amount := 5000;
    ELSE
      v_bonus_amount := 10000;
    END IF;

    -- Check if this section's bonus is already credited for this date
    SELECT * INTO v_bonus
    FROM daily_super_bonuses
    WHERE draw_date = v_draw_date AND room_slug = v_room.slug;

    IF FOUND AND v_bonus.status = 'credited' THEN
      v_results := v_results || jsonb_build_object(
        'room_slug', v_room.slug,
        'room_title', v_room.title,
        'stake_amount', v_room.stake_amount,
        'status', 'already_credited',
        'winner_telegram_user_id', v_bonus.winner_telegram_user_id,
        'super_bonus_amount', v_bonus.super_bonus_amount,
        'drawn_at', v_bonus.drawn_at
      );
      CONTINUE;
    END IF;

    -- Criterion 1: At least 24 finished games in this section today (GMT+3)
    SELECT COUNT(*) INTO v_section_games
    FROM games
    WHERE DATE(finished_at AT TIME ZONE 'UTC' + interval '3 hours') = v_draw_date
      AND status = 'finished'
      AND (room_slug = v_room.slug OR room_id = v_room.id);

    -- Criterion 2: At least 10 distinct winning candidates in this section today
    SELECT COUNT(DISTINCT telegram_user_id) INTO v_section_candidates
    FROM period_winners
    WHERE period_date = v_draw_date
      AND (room_slug = v_room.slug OR room_id = v_room.id);

    -- Check if criteria are met
    IF v_section_games < 24 OR v_section_candidates < 10 THEN
      v_results := v_results || jsonb_build_object(
        'room_slug', v_room.slug,
        'room_title', v_room.title,
        'stake_amount', v_room.stake_amount,
        'status', 'criteria_not_met',
        'games_today', v_section_games,
        'games_required', 24,
        'candidates_today', v_section_candidates,
        'candidates_required', 10,
        'potential_bonus', v_bonus_amount
      );
      CONTINUE;
    END IF;

    -- Criteria met! Select ONE lucky winner among distinct candidates (each represented once)
    SELECT
      pw.telegram_user_id,
      pw.admin_id,
      MAX(pw.period_number) as winning_period
    INTO v_candidate
    FROM period_winners pw
    WHERE pw.period_date = v_draw_date
      AND (pw.room_slug = v_room.slug OR pw.room_id = v_room.id)
    GROUP BY pw.telegram_user_id, pw.admin_id
    ORDER BY random()
    LIMIT 1;

    IF FOUND THEN
      -- Credit to user's deposited_balance (maintains gameplay liquidity)
      IF v_candidate.admin_id IS NOT NULL THEN
        UPDATE admin_user_wallets
        SET
          deposited_balance = deposited_balance + v_bonus_amount,
          updated_at = now()
        WHERE admin_id = v_candidate.admin_id
          AND telegram_user_id = v_candidate.telegram_user_id;

        INSERT INTO admin_ledger_transactions (
          admin_id,
          telegram_user_id,
          type,
          amount,
          description
        ) VALUES (
          v_candidate.admin_id,
          v_candidate.telegram_user_id,
          'deposit_credited',
          v_bonus_amount,
          format('🎉 DAILY MEGA SUPER BONUS! %s ETB for %s Section (Period #%s)', v_bonus_amount, v_room.title, v_candidate.winning_period)
        );
      END IF;

      UPDATE telegram_users
      SET
        deposited_balance = deposited_balance + v_bonus_amount,
        balance = balance + v_bonus_amount
      WHERE telegram_user_id = v_candidate.telegram_user_id;

      -- Record/Upsert into daily_super_bonuses
      INSERT INTO daily_super_bonuses (
        draw_date,
        room_slug,
        room_stake,
        winner_telegram_user_id,
        winner_admin_id,
        super_bonus_amount,
        winning_period_number,
        highest_stake,
        status,
        drawn_at
      ) VALUES (
        v_draw_date,
        v_room.slug,
        v_room.stake_amount,
        v_candidate.telegram_user_id,
        v_candidate.admin_id,
        v_bonus_amount,
        v_candidate.winning_period,
        v_room.stake_amount,
        'credited',
        now()
      )
      ON CONFLICT (draw_date, room_slug) DO UPDATE SET
        winner_telegram_user_id = EXCLUDED.winner_telegram_user_id,
        winner_admin_id = EXCLUDED.winner_admin_id,
        super_bonus_amount = EXCLUDED.super_bonus_amount,
        winning_period_number = EXCLUDED.winning_period_number,
        highest_stake = EXCLUDED.highest_stake,
        status = 'credited',
        drawn_at = now();

      v_results := v_results || jsonb_build_object(
        'room_slug', v_room.slug,
        'room_title', v_room.title,
        'stake_amount', v_room.stake_amount,
        'status', 'credited',
        'winner_telegram_user_id', v_candidate.telegram_user_id,
        'super_bonus_amount', v_bonus_amount,
        'winning_period_number', v_candidate.winning_period,
        'games_today', v_section_games,
        'candidates_today', v_section_candidates
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'draw_date', v_draw_date,
    'sections', v_results
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION draw_daily_super_bonus(date, text) TO anon, authenticated, service_role;
