-- Migration: 20260320000000_ye_addis_platform_modernization.sql
-- Ye Addis Games Modernization: Sections, Dual 24h Lotto, Multi-tier Finance & Owner Analytics

-- 1. Update Bingo Rooms to 5, 10, 15, 25, 50, 100 ETB (Replacing 20 with 25)
UPDATE bingo_rooms
SET
  name = '🏆 Addis Classic (25 ETB)',
  stake_amount = 25,
  min_balance = 25
WHERE id = 'addis_classic' OR slug = 'addis_classic';

INSERT INTO bingo_rooms (id, slug, name, theme_icon, stake_amount, min_balance, display_online_count, max_players, is_active, sort_order)
VALUES
  ('beginner_room', 'beginner_room', '🌱 Beginner Room (5 ETB)', '🌱', 5, 5, 5, 400, true, 1),
  ('starter_room', 'starter_room', '🎯 Starter Room (10 ETB)', '🎯', 10, 10, 20, 400, true, 2),
  ('standard_room', 'standard_room', '🎲 Standard Room (15 ETB)', '🎲', 15, 15, 30, 400, true, 3),
  ('addis_classic', 'addis_classic', '🏆 Addis Classic (25 ETB)', '🏆', 25, 25, 30, 400, true, 4),
  ('vip_diamond', 'vip_diamond', '💎 VIP Diamond (50 ETB)', '💎', 50, 50, 30, 400, true, 5),
  ('high_roller', 'high_roller', '👑 High Roller (100 ETB)', '👑', 100, 100, 30, 400, true, 6)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  stake_amount = EXCLUDED.stake_amount,
  min_balance = EXCLUDED.min_balance,
  is_active = true,
  sort_order = EXCLUDED.sort_order;

-- 2. Super Admins Table
CREATE TABLE IF NOT EXISTS super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  display_name text NOT NULL,
  phone text,
  float_balance numeric DEFAULT 0 CHECK (float_balance >= 0),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed initial super admin
INSERT INTO super_admins (username, display_name, float_balance, is_active)
VALUES ('superadmin', 'Super Admin Master', 100000, true)
ON CONFLICT (username) DO NOTHING;

-- 3. Super Admin Credit Purchases from Owner (+10% Bonus Rule)
CREATE TABLE IF NOT EXISTS super_admin_credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL REFERENCES super_admins(id) ON DELETE CASCADE,
  amount_paid numeric NOT NULL CHECK (amount_paid > 0),
  bonus_percentage numeric DEFAULT 10,
  bonus_amount numeric GENERATED ALWAYS AS (ROUND(amount_paid * bonus_percentage / 100, 2)) STORED,
  total_credit_received numeric GENERATED ALWAYS AS (ROUND(amount_paid * (1 + bonus_percentage / 100), 2)) STORED,
  confirmation_message text NOT NULL,
  parsed_transaction_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes text,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  CONSTRAINT uq_super_admin_txn_id UNIQUE (parsed_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_super_admin_credit_purchases_super ON super_admin_credit_purchases(super_admin_id);
CREATE INDEX IF NOT EXISTS idx_super_admin_credit_purchases_txn ON super_admin_credit_purchases(parsed_transaction_id);

-- 4. Admin Credit Requests from Super Admin
CREATE TABLE IF NOT EXISTS admin_credit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  super_admin_id uuid REFERENCES super_admins(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  confirmation_message text NOT NULL,
  parsed_transaction_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes text,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  CONSTRAINT uq_admin_credit_txn_id UNIQUE (admin_id, parsed_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_credit_requests_admin ON admin_credit_requests(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_credit_requests_super ON admin_credit_requests(super_admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_credit_requests_txn ON admin_credit_requests(parsed_transaction_id);

-- 5. User Financial Requests (Top Up & Cash Out) with Confirmation Messages & Unique Txn IDs
CREATE TABLE IF NOT EXISTS user_financial_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL REFERENCES telegram_users(telegram_user_id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('topup', 'cashout')),
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'telebirr',
  account_number text,
  account_name text,
  confirmation_message text,
  parsed_transaction_id text,
  admin_confirmation_message text,
  admin_transaction_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes text,
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  CONSTRAINT uq_user_financial_txn_per_admin UNIQUE (admin_id, parsed_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_user_fin_user ON user_financial_requests(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_user_fin_admin ON user_financial_requests(admin_id);
CREATE INDEX IF NOT EXISTS idx_user_fin_status ON user_financial_requests(status);
CREATE INDEX IF NOT EXISTS idx_user_fin_txn ON user_financial_requests(parsed_transaction_id);

-- 6. Owner Daily Cuts Table (Strictly Owner Eyes Only)
-- 30% of the 10% commission from bingo games when players >= 5
CREATE TABLE IF NOT EXISTS owner_daily_cuts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  game_id uuid REFERENCES games(id) ON DELETE SET NULL,
  room_id text,
  room_stake integer,
  players_count integer,
  pot_amount numeric NOT NULL,
  commission_total numeric NOT NULL,
  admin_cut_amount numeric NOT NULL,
  owner_cut_amount numeric NOT NULL,
  session_info text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_daily_cuts_date ON owner_daily_cuts(created_at);
CREATE INDEX IF NOT EXISTS idx_owner_daily_cuts_admin ON owner_daily_cuts(source_admin_id);

-- 7. Owner Daily Cut Lotto Table (Strictly Owner Eyes Only)
-- 10% cut from every 100 ETB Daily Lotto token purchase
CREATE TABLE IF NOT EXISTS owner_daily_cut_lotto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  round_id uuid,
  telegram_user_id bigint REFERENCES telegram_users(telegram_user_id) ON DELETE SET NULL,
  token_count integer NOT NULL DEFAULT 1,
  token_price numeric NOT NULL DEFAULT 100,
  total_spent numeric NOT NULL,
  admin_cut_amount numeric NOT NULL,
  owner_cut_amount numeric NOT NULL,
  pot_addition numeric NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_cut_lotto_date ON owner_daily_cut_lotto(created_at);

-- 8. Dual 24-Hour Lotto Tables
-- 8a. Daily Lotto (100 ETB per token, drawn at 6:00 PM local time, rollover if pot < 1000 ETB)
CREATE TABLE IF NOT EXISTS daily_lotto_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number integer GENERATED ALWAYS AS IDENTITY,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'drawing', 'finished', 'rolled_over')),
  ticket_price numeric NOT NULL DEFAULT 100,
  total_pot numeric NOT NULL DEFAULT 0,
  rollover_pot numeric NOT NULL DEFAULT 0,
  admin_cut_total numeric NOT NULL DEFAULT 0,
  owner_cut_total numeric NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  unique_users_count integer NOT NULL DEFAULT 0,
  draw_time timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_lotto_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES daily_lotto_rounds(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL REFERENCES telegram_users(telegram_user_id) ON DELETE CASCADE,
  admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  token_number integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_daily_lotto_round_token UNIQUE (round_id, token_number)
);

CREATE INDEX IF NOT EXISTS idx_daily_lotto_tokens_round ON daily_lotto_tokens(round_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_daily_lotto_tokens_user ON daily_lotto_tokens(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_daily_lotto_tokens_admin ON daily_lotto_tokens(admin_id);

CREATE TABLE IF NOT EXISTS daily_lotto_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES daily_lotto_rounds(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank >= 1 AND rank <= 10),
  telegram_user_id bigint NOT NULL REFERENCES telegram_users(telegram_user_id) ON DELETE CASCADE,
  admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  prize_amount numeric NOT NULL,
  token_number integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_daily_lotto_winner_rank UNIQUE (round_id, rank)
);

-- 8b. Daily Lotto Super Bonus (Drawn at 7:00 PM local time, pot = 20% of owner 24h cuts, reset if pot < 1000 ETB)
CREATE TABLE IF NOT EXISTS daily_lotto_super_bonus_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number integer GENERATED ALWAYS AS IDENTITY,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'drawing', 'finished', 'scrapped')),
  total_pot numeric NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  unique_users_count integer NOT NULL DEFAULT 0,
  draw_time timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_lotto_super_bonus_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES daily_lotto_super_bonus_rounds(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL REFERENCES telegram_users(telegram_user_id) ON DELETE CASCADE,
  admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  source_room_slug text,
  source_game_id uuid REFERENCES games(id) ON DELETE SET NULL,
  token_number integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_super_bonus_round_token UNIQUE (round_id, token_number)
);

CREATE INDEX IF NOT EXISTS idx_super_bonus_tokens_round ON daily_lotto_super_bonus_tokens(round_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_super_bonus_tokens_user ON daily_lotto_super_bonus_tokens(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_super_bonus_tokens_admin ON daily_lotto_super_bonus_tokens(admin_id);

CREATE TABLE IF NOT EXISTS daily_lotto_super_bonus_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES daily_lotto_super_bonus_rounds(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank >= 1 AND rank <= 10),
  telegram_user_id bigint NOT NULL REFERENCES telegram_users(telegram_user_id) ON DELETE CASCADE,
  admin_id uuid REFERENCES admins(id) ON DELETE SET NULL,
  prize_amount numeric NOT NULL,
  token_number integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_super_bonus_winner_rank UNIQUE (round_id, rank)
);

-- Seed initial open rounds if needed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM daily_lotto_rounds WHERE status = 'open') THEN
    INSERT INTO daily_lotto_rounds (status, ticket_price, total_pot, rollover_pot)
    VALUES ('open', 100, 0, 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM daily_lotto_super_bonus_rounds WHERE status = 'open') THEN
    INSERT INTO daily_lotto_super_bonus_rounds (status, total_pot)
    VALUES ('open', 0);
  END IF;
END $$;

-- 9. Helper: Calculate Owner 24-Hour Earnings Starting from 7:00 PM local time (GMT+3)
CREATE OR REPLACE FUNCTION get_owner_24h_super_bonus_pot()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now_eat timestamptz;
  v_cycle_start timestamptz;
  v_total_owner_cut numeric := 0;
  v_bonus_pot numeric := 0;
BEGIN
  v_now_eat := now() AT TIME ZONE 'UTC' + interval '3 hours';

  -- Today 19:00 EAT
  IF EXTRACT(HOUR FROM v_now_eat) >= 19 THEN
    v_cycle_start := DATE_TRUNC('day', v_now_eat) + interval '19 hours';
  ELSE
    v_cycle_start := DATE_TRUNC('day', v_now_eat) - interval '1 day' + interval '19 hours';
  END IF;

  -- Convert back to UTC for query
  v_cycle_start := v_cycle_start - interval '3 hours';

  SELECT COALESCE(SUM(owner_cut_amount), 0)
  INTO v_total_owner_cut
  FROM owner_daily_cuts
  WHERE created_at >= v_cycle_start;

  -- 20% of owner earnings forms the pot
  v_bonus_pot := ROUND(v_total_owner_cut * 0.20, 2);

  RETURN v_bonus_pot;
END;
$$;

-- 10. RPC: Buy Daily Lotto Tokens (100 ETB each, 20% Admin, 10% Owner, 70% Pot)
CREATE OR REPLACE FUNCTION buy_daily_lotto_tokens_v2(
  p_telegram_user_id bigint,
  p_admin_id uuid,
  p_token_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round RECORD;
  v_wallet RECORD;
  v_admin RECORD;
  v_total_cost numeric;
  v_admin_cut numeric;
  v_owner_cut numeric;
  v_pot_cut numeric;
  v_curr_token_num integer;
  v_ticket_numbers integer[] := '{}';
  v_i integer;
BEGIN
  IF p_token_count <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token count must be at least 1');
  END IF;

  v_total_cost := p_token_count * 100;
  v_admin_cut := p_token_count * 20;   -- 20%
  v_owner_cut := p_token_count * 10;   -- 10%
  v_pot_cut := p_token_count * 70;     -- 70%

  -- Validate admin
  SELECT * INTO v_admin FROM admins WHERE id = p_admin_id;
  IF NOT FOUND THEN
    SELECT id INTO p_admin_id FROM admins WHERE slug = 'parcelic' LIMIT 1;
  END IF;

  -- Ensure wallet exists
  INSERT INTO admin_user_wallets (telegram_user_id, admin_id, deposited_balance, won_balance)
  VALUES (p_telegram_user_id, p_admin_id, 0, 0)
  ON CONFLICT (telegram_user_id, admin_id) DO NOTHING;

  -- Lock wallet
  SELECT * INTO v_wallet
  FROM admin_user_wallets
  WHERE telegram_user_id = p_telegram_user_id AND admin_id = p_admin_id
  FOR UPDATE;

  IF (COALESCE(v_wallet.deposited_balance, 0) + COALESCE(v_wallet.won_balance, 0)) < v_total_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance to purchase Daily Lotto tokens');
  END IF;

  -- Deduct cost: prefer deposited_balance first, then won_balance
  IF v_wallet.deposited_balance >= v_total_cost THEN
    UPDATE admin_user_wallets
    SET
      deposited_balance = deposited_balance - v_total_cost,
      total_spent = total_spent + v_total_cost,
      updated_at = now()
    WHERE id = v_wallet.id;
  ELSE
    DECLARE
      v_rem numeric := v_total_cost - v_wallet.deposited_balance;
    BEGIN
      UPDATE admin_user_wallets
      SET
        deposited_balance = 0,
        won_balance = won_balance - v_rem,
        total_spent = total_spent + v_total_cost,
        updated_at = now()
      WHERE id = v_wallet.id;
    END;
  END IF;

  -- Get active open Daily Lotto round
  SELECT * INTO v_round
  FROM daily_lotto_rounds
  WHERE status = 'open'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO daily_lotto_rounds (status, ticket_price, total_pot)
    VALUES ('open', 100, 0)
    RETURNING * INTO v_round;
  END IF;

  -- Determine next token numbers
  SELECT COALESCE(MAX(token_number), 0) INTO v_curr_token_num
  FROM daily_lotto_tokens
  WHERE round_id = v_round.id;

  FOR v_i IN 1..p_token_count LOOP
    v_curr_token_num := v_curr_token_num + 1;
    INSERT INTO daily_lotto_tokens (round_id, telegram_user_id, admin_id, token_number)
    VALUES (v_round.id, p_telegram_user_id, p_admin_id, v_curr_token_num);
    v_ticket_numbers := array_append(v_ticket_numbers, v_curr_token_num);
  END LOOP;

  -- Update round pot and totals
  UPDATE daily_lotto_rounds
  SET
    total_pot = total_pot + v_pot_cut,
    admin_cut_total = admin_cut_total + v_admin_cut,
    owner_cut_total = owner_cut_total + v_owner_cut,
    total_tokens = total_tokens + p_token_count
  WHERE id = v_round.id;

  -- Update unique users count
  UPDATE daily_lotto_rounds
  SET unique_users_count = (SELECT COUNT(DISTINCT telegram_user_id) FROM daily_lotto_tokens WHERE round_id = v_round.id)
  WHERE id = v_round.id;

  -- Credit Admin Float with 20% cut
  UPDATE admins
  SET
    float_balance = float_balance + v_admin_cut,
    total_commission_earned = total_commission_earned + v_admin_cut,
    updated_at = now()
  WHERE id = p_admin_id;

  INSERT INTO admin_ledger_transactions (
    admin_id,
    telegram_user_id,
    type,
    amount,
    description
  ) VALUES (
    p_admin_id,
    p_telegram_user_id,
    'commission_earned',
    v_admin_cut,
    format('20%% Daily Lotto Cut (%s tokens bought, user %s)', p_token_count, p_telegram_user_id)
  );

  -- Record 10% Owner Cut
  INSERT INTO owner_daily_cut_lotto (
    source_admin_id,
    round_id,
    telegram_user_id,
    token_count,
    token_price,
    total_spent,
    admin_cut_amount,
    owner_cut_amount,
    pot_addition,
    notes
  ) VALUES (
    p_admin_id,
    v_round.id,
    p_telegram_user_id,
    p_token_count,
    100,
    v_total_cost,
    v_admin_cut,
    v_owner_cut,
    v_pot_cut,
    format('User %s purchased %s tokens under admin %s', p_telegram_user_id, p_token_count, p_admin_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'round_id', v_round.id,
    'round_number', v_round.round_number,
    'tokens_bought', p_token_count,
    'ticket_numbers', v_ticket_numbers,
    'total_cost', v_total_cost,
    'total_pot', v_round.total_pot + v_pot_cut
  );
END;
$$;

-- 11. RPC: Game Win Trigger (payout_winners_v3)
CREATE OR REPLACE FUNCTION payout_winners_v3()
RETURNS TRIGGER AS $$
DECLARE
  v_winner_id_val uuid;
  v_prize_amount integer;
  v_winner_rec RECORD;
  v_players_count integer;
  v_total_pot integer;
  v_total_commission numeric := 0;
  v_admin_commission_total numeric := 0;
  v_owner_commission_total numeric := 0;
  v_winner_prize_pool integer;
  v_num_winners integer;
  v_admin_cut_per_winner numeric := 0;
  v_owner_cut_per_winner numeric := 0;
  v_open_super_round RECORD;
  v_curr_super_token integer := 0;
  v_super_tokens_to_award integer := 0;
  v_k integer;
BEGIN
  IF NEW.status = 'finished' AND NEW.winners_paid = false AND NEW.winner_ids IS NOT NULL AND array_length(NEW.winner_ids, 1) > 0 THEN

    SELECT COUNT(DISTINCT id)
    INTO v_players_count
    FROM players
    WHERE game_id = NEW.id;

    v_total_pot := COALESCE(NEW.total_pot, 0);
    v_num_winners := array_length(NEW.winner_ids, 1);

    -- 10% Commission Rule when players >= 5
    IF v_players_count < 5 THEN
      v_total_commission := 0;
      v_admin_commission_total := 0;
      v_owner_commission_total := 0;
      v_winner_prize_pool := v_total_pot;
      v_prize_amount := FLOOR(v_winner_prize_pool / GREATEST(v_num_winners, 1));
      v_admin_cut_per_winner := 0;
      v_owner_cut_per_winner := 0;
    ELSE
      v_total_commission := ROUND(v_total_pot * 0.10, 2);
      v_admin_commission_total := ROUND(v_total_commission * 0.70, 2); -- 70% of 10%
      v_owner_commission_total := ROUND(v_total_commission * 0.30, 2); -- 30% of 10%
      v_winner_prize_pool := FLOOR(v_total_pot * 0.90);
      v_prize_amount := FLOOR(v_winner_prize_pool / GREATEST(v_num_winners, 1));
      v_admin_cut_per_winner := ROUND(v_admin_commission_total / GREATEST(v_num_winners, 1), 2);
      v_owner_cut_per_winner := ROUND(v_owner_commission_total / GREATEST(v_num_winners, 1), 2);
    END IF;

    NEW.winner_prize := v_winner_prize_pool;
    NEW.winner_prize_each := v_prize_amount;

    -- Super Bonus Token eligibility: Only for 25, 50, 100 ETB sections when players >= 12
    IF v_players_count >= 12 THEN
      IF NEW.stake_amount = 25 THEN
        v_super_tokens_to_award := 1;
      ELSIF NEW.stake_amount = 50 THEN
        v_super_tokens_to_award := 2;
      ELSIF NEW.stake_amount >= 100 THEN
        v_super_tokens_to_award := 4;
      ELSE
        v_super_tokens_to_award := 0;
      END IF;
    ELSE
      v_super_tokens_to_award := 0;
    END IF;

    -- Get or create open Daily Lotto Super Bonus round if tokens will be awarded
    IF v_super_tokens_to_award > 0 THEN
      SELECT * INTO v_open_super_round
      FROM daily_lotto_super_bonus_rounds
      WHERE status = 'open'
      ORDER BY created_at DESC
      LIMIT 1;

      IF NOT FOUND THEN
        INSERT INTO daily_lotto_super_bonus_rounds (status, total_pot)
        VALUES ('open', 0)
        RETURNING * INTO v_open_super_round;
      END IF;
    END IF;

    -- Credit each winning player directly to won_balance
    FOREACH v_winner_id_val IN ARRAY NEW.winner_ids
    LOOP
      SELECT p.id, p.telegram_user_id, p.admin_id, p.wallet_id
      INTO v_winner_rec
      FROM players p
      WHERE p.id = v_winner_id_val;

      IF FOUND THEN
        -- 1. All game prizes go directly to won_balance
        IF v_winner_rec.admin_id IS NOT NULL THEN
          UPDATE admin_user_wallets
          SET
            won_balance = won_balance + v_prize_amount,
            total_won = total_won + v_prize_amount,
            win_count = win_count + 1,
            updated_at = now()
          WHERE admin_id = v_winner_rec.admin_id
            AND telegram_user_id = v_winner_rec.telegram_user_id;

          INSERT INTO admin_ledger_transactions (
            admin_id,
            telegram_user_id,
            game_id,
            type,
            amount,
            description
          ) VALUES (
            v_winner_rec.admin_id,
            v_winner_rec.telegram_user_id,
            NEW.id,
            'win_credited',
            v_prize_amount,
            format('BINGO Win (%s ETB) in Game %s (Directly to Won Balance)', v_prize_amount, NEW.id)
          );
        END IF;

        UPDATE telegram_users
        SET
          won_balance = won_balance + v_prize_amount,
          balance = balance + v_prize_amount,
          total_won = total_won + v_prize_amount,
          win_count = win_count + 1
        WHERE telegram_user_id = v_winner_rec.telegram_user_id;

        -- 2. Award 70% of 10% commission to winning player's admin
        IF v_players_count >= 5 AND v_admin_cut_per_winner > 0 AND v_winner_rec.admin_id IS NOT NULL THEN
          UPDATE admins
          SET
            float_balance = float_balance + v_admin_cut_per_winner,
            total_commission_earned = total_commission_earned + v_admin_cut_per_winner,
            updated_at = now()
          WHERE id = v_winner_rec.admin_id;

          INSERT INTO admin_game_commissions (
            game_id,
            admin_id,
            room_id,
            players_count,
            total_stakes,
            commission_rate,
            commission_amount,
            status
          ) VALUES (
            NEW.id,
            v_winner_rec.admin_id,
            NEW.room_id,
            v_players_count,
            v_total_pot,
            0.10,
            v_admin_cut_per_winner,
            'credited'
          )
          ON CONFLICT (game_id, admin_id) DO UPDATE SET
            commission_amount = admin_game_commissions.commission_amount + EXCLUDED.commission_amount;

          INSERT INTO admin_ledger_transactions (
            admin_id,
            telegram_user_id,
            game_id,
            type,
            amount,
            description
          ) VALUES (
            v_winner_rec.admin_id,
            v_winner_rec.telegram_user_id,
            NEW.id,
            'commission_earned',
            v_admin_cut_per_winner,
            format('70%% Admin Commission for Game %s (Winner: %s, Pot: %s ETB)', NEW.id, v_winner_rec.telegram_user_id, v_total_pot)
          );
        END IF;

        -- 3. Award Super Bonus Tokens if 25, 50, 100 section and >= 12 players
        IF v_super_tokens_to_award > 0 AND v_open_super_round.id IS NOT NULL THEN
          SELECT COALESCE(MAX(token_number), 0) INTO v_curr_super_token
          FROM daily_lotto_super_bonus_tokens
          WHERE round_id = v_open_super_round.id;

          FOR v_k IN 1..v_super_tokens_to_award LOOP
            v_curr_super_token := v_curr_super_token + 1;
            INSERT INTO daily_lotto_super_bonus_tokens (
              round_id,
              telegram_user_id,
              admin_id,
              source_room_slug,
              source_game_id,
              token_number
            ) VALUES (
              v_open_super_round.id,
              v_winner_rec.telegram_user_id,
              v_winner_rec.admin_id,
              COALESCE(NEW.room_slug, NEW.room_id),
              NEW.id,
              v_curr_super_token
            );
          END LOOP;

          UPDATE daily_lotto_super_bonus_rounds
          SET
            total_tokens = total_tokens + v_super_tokens_to_award,
            unique_users_count = (SELECT COUNT(DISTINCT telegram_user_id) FROM daily_lotto_super_bonus_tokens WHERE round_id = v_open_super_round.id)
          WHERE id = v_open_super_round.id;
        END IF;

      END IF;
    END LOOP;

    -- 4. Record 30% Owner Daily Cut when players >= 5
    IF v_players_count >= 5 AND v_owner_commission_total > 0 THEN
      INSERT INTO owner_daily_cuts (
        source_admin_id,
        game_id,
        room_id,
        room_stake,
        players_count,
        pot_amount,
        commission_total,
        admin_cut_amount,
        owner_cut_amount,
        session_info
      ) VALUES (
        NEW.host_id::uuid,
        NEW.id,
        NEW.room_id,
        NEW.stake_amount,
        v_players_count,
        v_total_pot,
        v_total_commission,
        v_admin_commission_total,
        v_owner_commission_total,
        format('Game #%s (%s ETB room, %s players)', NEW.game_number, NEW.stake_amount, v_players_count)
      );
    END IF;

    NEW.winners_paid = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger for payout_winners_v3
DROP TRIGGER IF EXISTS payout_on_game_finish ON games;
CREATE TRIGGER payout_on_game_finish
  BEFORE UPDATE ON games
  FOR EACH ROW
  WHEN (NEW.status = 'finished' AND OLD.status != 'finished')
  EXECUTE FUNCTION payout_winners_v3();

-- 12. RPCs for User & Admin Cashier Workflows
-- 12a. User submit Top-Up request
CREATE OR REPLACE FUNCTION submit_user_topup_request(
  p_telegram_user_id bigint,
  p_admin_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_confirmation_message text,
  p_parsed_transaction_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req_id uuid;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero');
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_financial_requests
    WHERE admin_id = p_admin_id
      AND parsed_transaction_id = p_parsed_transaction_id
      AND status IN ('pending', 'approved')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This transaction ID has already been submitted or approved with this admin.', 'duplicate_txn', true);
  END IF;

  INSERT INTO user_financial_requests (
    telegram_user_id,
    admin_id,
    type,
    amount,
    payment_method,
    confirmation_message,
    parsed_transaction_id,
    status
  ) VALUES (
    p_telegram_user_id,
    p_admin_id,
    'topup',
    p_amount,
    p_payment_method,
    p_confirmation_message,
    p_parsed_transaction_id,
    'pending'
  )
  RETURNING id INTO v_req_id;

  RETURN jsonb_build_object('success', true, 'request_id', v_req_id, 'message', 'Top up request submitted for admin review');
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'Duplicate transaction ID detected. Embezzlement flag raised.', 'duplicate_txn', true);
END;
$$;

-- 12b. User submit Cash-Out request
CREATE OR REPLACE FUNCTION submit_user_cashout_request(
  p_telegram_user_id bigint,
  p_admin_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_account_number text,
  p_account_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet RECORD;
  v_req_id uuid;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero');
  END IF;

  SELECT * INTO v_wallet
  FROM admin_user_wallets
  WHERE telegram_user_id = p_telegram_user_id AND admin_id = p_admin_id
  FOR UPDATE;

  IF NOT FOUND OR COALESCE(v_wallet.won_balance, 0) < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient won balance for cash out');
  END IF;

  INSERT INTO user_financial_requests (
    telegram_user_id,
    admin_id,
    type,
    amount,
    payment_method,
    account_number,
    account_name,
    status
  ) VALUES (
    p_telegram_user_id,
    p_admin_id,
    'cashout',
    p_amount,
    p_payment_method,
    p_account_number,
    p_account_name,
    'pending'
  )
  RETURNING id INTO v_req_id;

  RETURN jsonb_build_object('success', true, 'request_id', v_req_id, 'message', 'Cash out request submitted to admin');
END;
$$;

-- 12c. Admin review user request (Approve or Reject)
CREATE OR REPLACE FUNCTION admin_review_user_financial_request(
  p_request_id uuid,
  p_admin_id uuid,
  p_action text,
  p_admin_confirmation_message text DEFAULT NULL,
  p_admin_transaction_id text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_wallet RECORD;
BEGIN
  SELECT * INTO v_req
  FROM user_financial_requests
  WHERE id = p_request_id AND admin_id = p_admin_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request has already been reviewed');
  END IF;

  IF p_action = 'approved' THEN
    IF v_req.type = 'topup' THEN
      INSERT INTO admin_user_wallets (telegram_user_id, admin_id, deposited_balance, won_balance)
      VALUES (v_req.telegram_user_id, p_admin_id, 0, 0)
      ON CONFLICT (telegram_user_id, admin_id) DO NOTHING;

      UPDATE admin_user_wallets
      SET
        deposited_balance = deposited_balance + v_req.amount,
        updated_at = now()
      WHERE telegram_user_id = v_req.telegram_user_id AND admin_id = p_admin_id;

      UPDATE telegram_users
      SET
        deposited_balance = deposited_balance + v_req.amount,
        balance = balance + v_req.amount
      WHERE telegram_user_id = v_req.telegram_user_id;

      INSERT INTO admin_ledger_transactions (
        admin_id,
        telegram_user_id,
        type,
        amount,
        description
      ) VALUES (
        p_admin_id,
        v_req.telegram_user_id,
        'deposit_credit',
        v_req.amount,
        format('Top up approved (Txn: %s)', COALESCE(v_req.parsed_transaction_id, 'N/A'))
      );

    ELSIF v_req.type = 'cashout' THEN
      SELECT * INTO v_wallet
      FROM admin_user_wallets
      WHERE telegram_user_id = v_req.telegram_user_id AND admin_id = p_admin_id
      FOR UPDATE;

      IF v_wallet.won_balance < v_req.amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'User won balance insufficient at approval time');
      END IF;

      UPDATE admin_user_wallets
      SET
        won_balance = won_balance - v_req.amount,
        updated_at = now()
      WHERE id = v_wallet.id;

      UPDATE telegram_users
      SET
        won_balance = GREATEST(won_balance - v_req.amount, 0),
        balance = GREATEST(balance - v_req.amount, 0)
      WHERE telegram_user_id = v_req.telegram_user_id;

      INSERT INTO admin_ledger_transactions (
        admin_id,
        telegram_user_id,
        type,
        amount,
        description
      ) VALUES (
        p_admin_id,
        v_req.telegram_user_id,
        'admin_debit',
        -v_req.amount,
        format('Cash out approved (Payout Txn: %s)', COALESCE(p_admin_transaction_id, 'N/A'))
      );
    END IF;

    UPDATE user_financial_requests
    SET
      status = 'approved',
      admin_confirmation_message = p_admin_confirmation_message,
      admin_transaction_id = p_admin_transaction_id,
      notes = p_notes,
      reviewed_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'action', 'approved', 'type', v_req.type);

  ELSE
    UPDATE user_financial_requests
    SET
      status = 'rejected',
      notes = p_notes,
      reviewed_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'action', 'rejected', 'type', v_req.type);
  END IF;
END;
$$;

-- 12d. Owner Credits Super Admin (+10% Bonus Rule)
CREATE OR REPLACE FUNCTION owner_credit_super_admin(
  p_super_admin_id uuid,
  p_amount_paid numeric,
  p_confirmation_message text,
  p_parsed_transaction_id text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_to_add numeric;
  v_purchase_id uuid;
BEGIN
  IF p_amount_paid <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  v_credit_to_add := ROUND(p_amount_paid * 1.10, 2); -- 10% Extra Bonus

  INSERT INTO super_admin_credit_purchases (
    super_admin_id,
    amount_paid,
    confirmation_message,
    parsed_transaction_id,
    status,
    notes,
    approved_at
  ) VALUES (
    p_super_admin_id,
    p_amount_paid,
    p_confirmation_message,
    p_parsed_transaction_id,
    'approved',
    p_notes,
    now()
  )
  RETURNING id INTO v_purchase_id;

  UPDATE super_admins
  SET
    float_balance = float_balance + v_credit_to_add,
    updated_at = now()
  WHERE id = p_super_admin_id;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'amount_paid', p_amount_paid,
    'bonus_credited', ROUND(p_amount_paid * 0.10, 2),
    'total_float_added', v_credit_to_add
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'Duplicate transaction ID detected on Super Admin purchase.', 'duplicate_txn', true);
END;
$$;

-- 12e. Super Admin reviews and fulfills Admin Credit Request
CREATE OR REPLACE FUNCTION super_admin_fulfill_admin_credit(
  p_request_id uuid,
  p_super_admin_id uuid,
  p_action text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_super RECORD;
BEGIN
  SELECT * INTO v_req
  FROM admin_credit_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Credit request not found');
  END IF;

  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request has already been processed');
  END IF;

  IF p_action = 'approved' THEN
    SELECT * INTO v_super
    FROM super_admins
    WHERE id = p_super_admin_id
    FOR UPDATE;

    IF v_super.float_balance < v_req.amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'Super Admin float balance is insufficient. Top up from Owner first.');
    END IF;

    UPDATE super_admins
    SET float_balance = float_balance - v_req.amount, updated_at = now()
    WHERE id = p_super_admin_id;

    UPDATE admins
    SET float_balance = float_balance + v_req.amount, updated_at = now()
    WHERE id = v_req.admin_id;

    INSERT INTO admin_ledger_transactions (
      admin_id,
      type,
      amount,
      description
    ) VALUES (
      v_req.admin_id,
      'float_adjustment',
      v_req.amount,
      format('Credit purchase fulfilled by Super Admin (Txn: %s)', v_req.parsed_transaction_id)
    );

    UPDATE admin_credit_requests
    SET
      status = 'approved',
      super_admin_id = p_super_admin_id,
      notes = p_notes,
      approved_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'action', 'approved', 'amount', v_req.amount);
  ELSE
    UPDATE admin_credit_requests
    SET
      status = 'rejected',
      super_admin_id = p_super_admin_id,
      notes = p_notes,
      approved_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'action', 'rejected');
  END IF;
END;
$$;
