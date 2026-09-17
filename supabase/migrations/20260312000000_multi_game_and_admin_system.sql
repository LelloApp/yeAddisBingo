-- Multi-Game Architecture, 6-Room Bingo Engine, and Admin-Scoped Crediting System
-- Migration: 20260312000000_multi_game_and_admin_system.sql

-- 1. Game Catalog Table (Quiz, Chez, Bingo)
CREATE TABLE IF NOT EXISTS games_catalog (
  id text PRIMARY KEY,
  title text NOT NULL,
  subtitle text,
  description text,
  icon text DEFAULT '🎮',
  badge text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'coming_soon', 'maintenance')),
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Seed games catalog
INSERT INTO games_catalog (id, title, subtitle, description, icon, badge, status, sort_order)
VALUES
  ('bingo', '🎯 Addis Bingo', 'Multiplayer Live Rooms', 'Live multiplayer bingo with instant cash prizes', '🎯', '🔥 LIVE', 'active', 1),
  ('daily_lotto', '🎟️ Addis Daily Lotto', '12-Hour Morning to Evening Draw', 'Daily lottery: 5 ETB/token, morning entry, evening draw with full pot distribution', '🎟️', '🔥 5 ETB / TOKEN', 'active', 2),
  ('quiz', '🧠 Addis Quiz Arena', 'Trivia & Skill Battles', 'Real-time quiz challenges and speed competitions', '🧠', '⏳ COMING SOON', 'coming_soon', 3)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  description = EXCLUDED.description,
  badge = EXCLUDED.badge,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order;

DELETE FROM games_catalog WHERE id = 'chez';

-- 2. Bingo Room Sections (The 6 Rooms: 5, 10, 15, 20, 50, 100 ETB)
CREATE TABLE IF NOT EXISTS bingo_rooms (
  id text PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  theme_icon text DEFAULT '🎯',
  stake_amount integer NOT NULL,
  min_balance integer NOT NULL,
  display_online_count integer DEFAULT 20,
  max_players integer DEFAULT 400,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Seed 6 official bingo rooms
INSERT INTO bingo_rooms (id, slug, name, theme_icon, stake_amount, min_balance, display_online_count, max_players, is_active, sort_order)
VALUES
  ('beginner_room', 'beginner_room', '🌱 Beginner Room (5 ETB)', '🌱', 5, 5, 5, 400, true, 1),
  ('starter_room', 'starter_room', '🎯 Starter Room (10 ETB)', '🎯', 10, 10, 20, 400, true, 2),
  ('standard_room', 'standard_room', '🎲 Standard Room (15 ETB)', '🎲', 15, 15, 30, 400, true, 3),
  ('addis_classic', 'addis_classic', '🏆 Addis Classic (20 ETB)', '🏆', 20, 20, 30, 400, true, 4),
  ('vip_diamond', 'vip_diamond', '💎 VIP Diamond (50 ETB)', '💎', 50, 50, 30, 400, true, 5),
  ('high_roller', 'high_roller', '👑 High Roller (100 ETB)', '👑', 100, 100, 30, 400, true, 6)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  theme_icon = EXCLUDED.theme_icon,
  stake_amount = EXCLUDED.stake_amount,
  min_balance = EXCLUDED.min_balance,
  display_online_count = EXCLUDED.display_online_count,
  max_players = EXCLUDED.max_players,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

-- 3. Admins / Agents Table
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  telegram_user_id bigint UNIQUE,
  telegram_username text NOT NULL,
  display_name text NOT NULL,
  phone text,
  commission_rate numeric DEFAULT 0.10 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  float_balance numeric DEFAULT 0,
  total_commission_earned numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed initial admins
INSERT INTO admins (slug, telegram_username, display_name, commission_rate, is_active, sort_order)
VALUES
  ('parcelic', 'parcelic', 'Parcelic Admin', 0.10, true, 1),
  ('fekadu_kera', 'fekadu_kera_bot', 'ፍቃዱ ቄራ (Fekadu Kera)', 0.10, true, 2),
  ('hasen_stadium', 'hasen_stadium_bot', 'ሀሰን ስታዲየም (Hasen Stadium)', 0.10, true, 3)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  telegram_username = EXCLUDED.telegram_username,
  commission_rate = EXCLUDED.commission_rate,
  is_active = EXCLUDED.is_active;

-- 4. Admin-Scoped User Wallets (User balance isolated per Admin)
CREATE TABLE IF NOT EXISTS admin_user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL REFERENCES telegram_users(telegram_user_id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  deposited_balance integer NOT NULL DEFAULT 0 CHECK (deposited_balance >= 0),
  won_balance integer NOT NULL DEFAULT 0 CHECK (won_balance >= 0),
  total_spent integer NOT NULL DEFAULT 0,
  total_won integer NOT NULL DEFAULT 0,
  win_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT unique_user_admin_wallet UNIQUE (telegram_user_id, admin_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_user_wallets_user ON admin_user_wallets(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_user_wallets_admin ON admin_user_wallets(admin_id);

-- Migrate existing telegram_users balances into admin_user_wallets under default admin ('parcelic')
DO $$
DECLARE
  v_default_admin_id uuid;
BEGIN
  SELECT id INTO v_default_admin_id FROM admins WHERE slug = 'parcelic' LIMIT 1;
  IF v_default_admin_id IS NOT NULL THEN
    INSERT INTO admin_user_wallets (telegram_user_id, admin_id, deposited_balance, won_balance, total_spent, total_won, win_count)
    SELECT
      tu.telegram_user_id,
      v_default_admin_id,
      COALESCE(tu.deposited_balance, 0),
      COALESCE(tu.won_balance, 0),
      COALESCE(tu.total_spent, 0),
      COALESCE(tu.total_won, 0),
      COALESCE(tu.win_count, 0)
    FROM telegram_users tu
    ON CONFLICT (telegram_user_id, admin_id) DO UPDATE SET
      deposited_balance = EXCLUDED.deposited_balance,
      won_balance = EXCLUDED.won_balance;
  END IF;
END $$;

-- 5. Extend Games table with room_id, room_slug and max 6 concurrent sessions rule
ALTER TABLE games ADD COLUMN IF NOT EXISTS room_id text REFERENCES bingo_rooms(id);
ALTER TABLE games ADD COLUMN IF NOT EXISTS room_slug text;

-- Backfill existing games with starter_room if null
UPDATE games SET room_id = 'starter_room', room_slug = 'starter_room' WHERE room_id IS NULL;

-- Ensure room_id defaults to starter_room if not provided
ALTER TABLE games ALTER COLUMN room_id SET DEFAULT 'starter_room';

-- Crucial: Maximum 1 active/waiting session PER ROOM (total max 6 sessions running at a time)
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_game_per_room
ON games (room_id)
WHERE status IN ('waiting', 'playing');

-- 6. Extend Players table with admin_id and wallet_id
ALTER TABLE players ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES admins(id);
ALTER TABLE players ADD COLUMN IF NOT EXISTS wallet_id uuid REFERENCES admin_user_wallets(id);
CREATE INDEX IF NOT EXISTS idx_players_game_admin ON players(game_id, admin_id);

-- 7. Admin Ledger Transactions (Financial Sheet for Admins)
CREATE TABLE IF NOT EXISTS admin_ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  telegram_user_id bigint REFERENCES telegram_users(telegram_user_id),
  game_id uuid REFERENCES games(id),
  type text NOT NULL CHECK (type IN ('deposit_credit', 'admin_debit', 'stake_deducted', 'win_credited', 'commission_earned', 'float_adjustment', 'transfer')),
  amount numeric NOT NULL,
  balance_after numeric,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_ledger_admin_created ON admin_ledger_transactions(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_ledger_user ON admin_ledger_transactions(telegram_user_id);

-- 8. Admin Game Commissions Table (10% Cut per game per participating admin)
CREATE TABLE IF NOT EXISTS admin_game_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  room_id text REFERENCES bingo_rooms(id),
  players_count integer NOT NULL DEFAULT 0,
  total_stakes numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 0.10,
  commission_amount numeric NOT NULL DEFAULT 0,
  winner_payout_total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'credited',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_game_admin_commission UNIQUE (game_id, admin_id)
);

CREATE INDEX IF NOT EXISTS idx_commissions_game ON admin_game_commissions(game_id);
CREATE INDEX IF NOT EXISTS idx_commissions_admin ON admin_game_commissions(admin_id);

-- 9. RPC: Ensure Room Waiting Game (Auto-session lifecycle for 6 rooms)
CREATE OR REPLACE FUNCTION ensure_room_waiting_game(
  p_room_id text,
  p_seconds integer DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room RECORD;
  v_existing_game RECORD;
  v_new_game_id uuid;
  v_game_number integer;
  v_starts_at timestamptz;
  v_selection_closed_at timestamptz;
BEGIN
  -- Lookup room details
  SELECT * INTO v_room FROM bingo_rooms WHERE id = p_room_id OR slug = p_room_id LIMIT 1;
  IF NOT FOUND THEN
    p_room_id := 'starter_room';
    SELECT * INTO v_room FROM bingo_rooms WHERE id = p_room_id LIMIT 1;
  END IF;

  -- Check if an active or waiting game already exists for this room
  SELECT id, status, game_number, starts_at, selection_closed_at
  INTO v_existing_game
  FROM games
  WHERE room_id = v_room.id AND status IN ('waiting', 'playing')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'game_id', v_existing_game.id,
      'status', v_existing_game.status,
      'game_number', v_existing_game.game_number,
      'starts_at', v_existing_game.starts_at,
      'selection_closed_at', v_existing_game.selection_closed_at,
      'already_exists', true
    );
  END IF;

  -- Generate next game number
  SELECT COALESCE(MAX(game_number), 0) + 1 INTO v_game_number FROM games;

  -- Calculate countdown timings
  v_starts_at := now() + (p_seconds * interval '1 second');
  v_selection_closed_at := now() + ((p_seconds - 10) * interval '1 second');

  -- Insert new waiting game for this room
  INSERT INTO games (
    status,
    stake_amount,
    room_id,
    room_slug,
    game_number,
    host_id,
    called_numbers,
    starts_at,
    selection_closed_at,
    allow_late_joins,
    winners_paid,
    winner_prize
  ) VALUES (
    'waiting',
    v_room.stake_amount,
    v_room.id,
    v_room.slug,
    v_game_number,
    'system',
    ARRAY[]::integer[],
    v_starts_at,
    v_selection_closed_at,
    true,
    false,
    0
  )
  RETURNING id INTO v_new_game_id;

  RETURN jsonb_build_object(
    'success', true,
    'game_id', v_new_game_id,
    'status', 'waiting',
    'game_number', v_game_number,
    'starts_at', v_starts_at,
    'selection_closed_at', v_selection_closed_at,
    'room_id', v_room.id,
    'stake_amount', v_room.stake_amount,
    'already_exists', false
  );
EXCEPTION WHEN unique_violation THEN
  -- Concurrency race check: Another client created the waiting game simultaneously
  SELECT id, status, game_number, starts_at, selection_closed_at
  INTO v_existing_game
  FROM games
  WHERE room_id = v_room.id AND status IN ('waiting', 'playing')
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'game_id', v_existing_game.id,
    'status', v_existing_game.status,
    'game_number', v_existing_game.game_number,
    'starts_at', v_existing_game.starts_at,
    'selection_closed_at', v_existing_game.selection_closed_at,
    'already_exists', true
  );
END;
$$;

-- 10. RPC: Admin Credit / Debit User in Admin-Scoped Wallet
CREATE OR REPLACE FUNCTION admin_adjust_user_credit(
  p_admin_id uuid,
  p_target_telegram_id bigint,
  p_amount integer,
  p_is_credit boolean,
  p_balance_type text DEFAULT 'deposited'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin RECORD;
  v_wallet RECORD;
  v_new_deposited integer;
  v_new_won integer;
  v_new_total integer;
BEGIN
  -- Validate admin
  SELECT * INTO v_admin FROM admins WHERE id = p_admin_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin not found or inactive');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero');
  END IF;

  -- Ensure user wallet exists under this admin
  INSERT INTO admin_user_wallets (telegram_user_id, admin_id, deposited_balance, won_balance)
  VALUES (p_target_telegram_id, p_admin_id, 0, 0)
  ON CONFLICT (telegram_user_id, admin_id) DO NOTHING;

  -- Lock wallet
  SELECT * INTO v_wallet
  FROM admin_user_wallets
  WHERE telegram_user_id = p_target_telegram_id AND admin_id = p_admin_id
  FOR UPDATE;

  IF p_is_credit THEN
    IF p_balance_type = 'won' THEN
      v_new_won := v_wallet.won_balance + p_amount;
      v_new_deposited := v_wallet.deposited_balance;
    ELSE
      v_new_deposited := v_wallet.deposited_balance + p_amount;
      v_new_won := v_wallet.won_balance;
    END IF;

    UPDATE admin_user_wallets
    SET
      deposited_balance = v_new_deposited,
      won_balance = v_new_won,
      updated_at = now()
    WHERE id = v_wallet.id;

    v_new_total := v_new_deposited + v_new_won;

    -- Record transaction
    INSERT INTO admin_ledger_transactions (
      admin_id,
      telegram_user_id,
      type,
      amount,
      balance_after,
      description
    ) VALUES (
      p_admin_id,
      p_target_telegram_id,
      'deposit_credit',
      p_amount,
      v_new_total,
      format('Credited %s ETB to %s balance', p_amount, p_balance_type)
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'credit',
      'amount', p_amount,
      'deposited_balance', v_new_deposited,
      'won_balance', v_new_won,
      'total_balance', v_new_total
    );
  ELSE
    -- Debit
    IF p_balance_type = 'won' THEN
      IF v_wallet.won_balance < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient won balance for debit');
      END IF;
      v_new_won := v_wallet.won_balance - p_amount;
      v_new_deposited := v_wallet.deposited_balance;
    ELSE
      IF (v_wallet.deposited_balance + v_wallet.won_balance) < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance for debit');
      END IF;
      IF v_wallet.deposited_balance >= p_amount THEN
        v_new_deposited := v_wallet.deposited_balance - p_amount;
        v_new_won := v_wallet.won_balance;
      ELSE
        v_new_deposited := 0;
        v_new_won := v_wallet.won_balance - (p_amount - v_wallet.deposited_balance);
      END IF;
    END IF;

    UPDATE admin_user_wallets
    SET
      deposited_balance = v_new_deposited,
      won_balance = v_new_won,
      updated_at = now()
    WHERE id = v_wallet.id;

    v_new_total := v_new_deposited + v_new_won;

    -- Record transaction
    INSERT INTO admin_ledger_transactions (
      admin_id,
      telegram_user_id,
      type,
      amount,
      balance_after,
      description
    ) VALUES (
      p_admin_id,
      p_target_telegram_id,
      'admin_debit',
      -p_amount,
      v_new_total,
      format('Debited %s ETB from balance', p_amount)
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'debit',
      'amount', p_amount,
      'deposited_balance', v_new_deposited,
      'won_balance', v_new_won,
      'total_balance', v_new_total
    );
  END IF;
END;
$$;

-- 11. RPC: select_card_atomic_v2 (Admin-Scoped Balance & Concurrency)
CREATE OR REPLACE FUNCTION select_card_atomic_v2(
  p_game_id uuid,
  p_card_number integer,
  p_telegram_user_id bigint,
  p_admin_id uuid,
  p_player_name text,
  p_card jsonb DEFAULT NULL,
  p_card_numbers jsonb DEFAULT NULL,
  p_marked_cells jsonb DEFAULT NULL,
  p_telegram_username text DEFAULT NULL,
  p_telegram_first_name text DEFAULT NULL,
  p_telegram_last_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game RECORD;
  v_wallet RECORD;
  v_existing_player uuid;
  v_current_time timestamptz;
  v_player_id uuid;
  v_stake integer;
  v_deduct_deposited integer := 0;
  v_deduct_won integer := 0;
  v_total_avail integer;
  v_default_admin_id uuid;
BEGIN
  v_current_time := now();

  -- Lock and validate game
  SELECT id, status, stake_amount, selection_closed_at, starts_at, allow_late_joins, room_id
  INTO v_game
  FROM games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found', 'error_code', 'GAME_NOT_FOUND');
  END IF;

  IF v_game.status != 'waiting' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is no longer accepting players', 'error_code', 'GAME_NOT_WAITING');
  END IF;

  IF v_current_time > v_game.selection_closed_at + (CASE WHEN v_game.allow_late_joins THEN interval '2 seconds' ELSE interval '0 seconds' END) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Selection window has closed', 'error_code', 'SELECTION_CLOSED');
  END IF;

  -- Ensure card number is not already selected (1 to 400)
  SELECT id INTO v_existing_player
  FROM players
  WHERE game_id = p_game_id AND selected_number = p_card_number
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Card number already taken', 'error_code', 'CARD_TAKEN');
  END IF;

  -- Fallback admin if null
  IF p_admin_id IS NULL THEN
    SELECT id INTO v_default_admin_id FROM admins WHERE slug = 'parcelic' LIMIT 1;
    p_admin_id := v_default_admin_id;
  END IF;

  -- Ensure wallet exists
  INSERT INTO admin_user_wallets (telegram_user_id, admin_id, deposited_balance, won_balance)
  VALUES (p_telegram_user_id, p_admin_id, 0, 0)
  ON CONFLICT (telegram_user_id, admin_id) DO NOTHING;

  -- Lock user wallet under this admin
  SELECT * INTO v_wallet
  FROM admin_user_wallets
  WHERE telegram_user_id = p_telegram_user_id AND admin_id = p_admin_id
  FOR UPDATE;

  v_stake := COALESCE(v_game.stake_amount, 10);
  v_total_avail := v_wallet.deposited_balance + v_wallet.won_balance;

  IF v_total_avail < v_stake THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Insufficient balance with selected admin. Stake: %s ETB, Balance: %s ETB', v_stake, v_total_avail),
      'error_code', 'INSUFFICIENT_BALANCE',
      'required', v_stake,
      'available', v_total_avail
    );
  END IF;

  -- Deduct stake (prefer deposited balance first)
  IF v_wallet.deposited_balance >= v_stake THEN
    v_deduct_deposited := v_stake;
    v_deduct_won := 0;
  ELSE
    v_deduct_deposited := v_wallet.deposited_balance;
    v_deduct_won := v_stake - v_wallet.deposited_balance;
  END IF;

  UPDATE admin_user_wallets
  SET
    deposited_balance = deposited_balance - v_deduct_deposited,
    won_balance = won_balance - v_deduct_won,
    total_spent = total_spent + v_stake,
    updated_at = now()
  WHERE id = v_wallet.id;

  -- Insert player record
  INSERT INTO players (
    game_id,
    name,
    card,
    card_numbers,
    marked_cells,
    selected_number,
    telegram_user_id,
    telegram_username,
    telegram_first_name,
    telegram_last_name,
    admin_id,
    wallet_id
  ) VALUES (
    p_game_id,
    p_player_name,
    p_card,
    p_card_numbers,
    p_marked_cells,
    p_card_number,
    p_telegram_user_id,
    p_telegram_username,
    p_telegram_first_name,
    p_telegram_last_name,
    p_admin_id,
    v_wallet.id
  )
  RETURNING id INTO v_player_id;

  -- Record ledger transaction for stake deduction
  INSERT INTO admin_ledger_transactions (
    admin_id,
    telegram_user_id,
    game_id,
    type,
    amount,
    balance_after,
    description
  ) VALUES (
    p_admin_id,
    p_telegram_user_id,
    p_game_id,
    'stake_deducted',
    -v_stake,
    (v_wallet.deposited_balance - v_deduct_deposited + v_wallet.won_balance - v_deduct_won),
    format('Card #%s selected in Game %s (Stake %s ETB)', p_card_number, p_game_id, v_stake)
  );

  RETURN jsonb_build_object(
    'success', true,
    'player_id', v_player_id,
    'card_number', p_card_number,
    'admin_id', p_admin_id,
    'selection_closed_at', v_game.selection_closed_at,
    'starts_at', v_game.starts_at
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', 'INTERNAL_ERROR'
  );
END;
$$;

-- 12. RPC: Payout Winners v2 with Dynamic Commission & Winner Admin Rules
-- Rule 1: The 10% commission goes exclusively to the admin through whom the winning user entered.
-- Rule 6: If players < 5, winner takes everything (100% pot) with 0% admin commission.
--         Admin 10% commission is deducted ONLY when 5 or more players participate.
CREATE OR REPLACE FUNCTION payout_winners_v2()
RETURNS TRIGGER AS $$
DECLARE
  v_winner_id_val uuid;
  v_prize_amount integer;
  v_winner_rec RECORD;
  v_players_count integer;
  v_total_pot integer;
  v_admin_commission numeric;
  v_winner_prize_pool integer;
  v_num_winners integer;
  v_commission_per_winner numeric;
BEGIN
  IF NEW.status = 'finished' AND NEW.winners_paid = false AND NEW.winner_ids IS NOT NULL AND array_length(NEW.winner_ids, 1) > 0 THEN
    
    -- Count total unique players in this game
    SELECT COUNT(DISTINCT id)
    INTO v_players_count
    FROM players
    WHERE game_id = NEW.id;

    v_total_pot := COALESCE(NEW.total_pot, 0);
    v_num_winners := array_length(NEW.winner_ids, 1);

    -- If players < 5: Winner takes everything (100%), admin commission is 0
    -- If players >= 5: Winner prize is 90% pot, 10% commission goes to winner's admin
    IF v_players_count < 5 THEN
      v_admin_commission := 0;
      v_winner_prize_pool := v_total_pot;
      v_prize_amount := FLOOR(v_winner_prize_pool / GREATEST(v_num_winners, 1));
      v_commission_per_winner := 0;
    ELSE
      v_admin_commission := ROUND(v_total_pot * 0.10, 2);
      v_winner_prize_pool := FLOOR(v_total_pot * 0.90);
      v_prize_amount := FLOOR(v_winner_prize_pool / GREATEST(v_num_winners, 1));
      v_commission_per_winner := ROUND(v_admin_commission / GREATEST(v_num_winners, 1), 2);
    END IF;

    -- Update game record with finalized prizes
    NEW.winner_prize := v_winner_prize_pool;
    NEW.winner_prize_each := v_prize_amount;

    -- Credit each winning player and their respective admin
    FOREACH v_winner_id_val IN ARRAY NEW.winner_ids
    LOOP
      SELECT p.id, p.telegram_user_id, p.admin_id, p.wallet_id
      INTO v_winner_rec
      FROM players p
      WHERE p.id = v_winner_id_val;

      IF FOUND THEN
        -- Cashflow Protection & Liquidity Rule:
        -- If players < 12: Prize credited to DEPOSITED_BALANCE (playable, prevents cashout loops)
        -- If players >= 12: Prize credited to WON_BALANCE (withdrawable cash win)
        IF v_players_count < 12 THEN
          IF v_winner_rec.admin_id IS NOT NULL THEN
            UPDATE admin_user_wallets
            SET
              deposited_balance = deposited_balance + v_prize_amount,
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
              'deposit_credited',
              v_prize_amount,
              format('BINGO Win (%s ETB) in Game %s [<12 players: Credited to Playable Balance]', v_prize_amount, NEW.id)
            );
          END IF;

          UPDATE telegram_users
          SET
            deposited_balance = deposited_balance + v_prize_amount,
            balance = balance + v_prize_amount,
            total_won = total_won + v_prize_amount,
            win_count = win_count + 1
          WHERE telegram_user_id = v_winner_rec.telegram_user_id;

        ELSE
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
              format('BINGO Cashable Win (%s ETB) in Game %s [12+ players Tournament]', v_prize_amount, NEW.id)
            );
          END IF;

          UPDATE telegram_users
          SET
            won_balance = won_balance + v_prize_amount,
            balance = balance + v_prize_amount,
            total_won = total_won + v_prize_amount,
            win_count = win_count + 1
          WHERE telegram_user_id = v_winner_rec.telegram_user_id;
        END IF;

        -- Award 10% commission ONLY to the winning player's admin when 5+ players
          IF v_players_count >= 5 AND v_commission_per_winner > 0 THEN
            UPDATE admins
            SET
              float_balance = float_balance + v_commission_per_winner,
              total_commission_earned = total_commission_earned + v_commission_per_winner,
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
              v_commission_per_winner,
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
              v_commission_per_winner,
              format('10%% Winner Admin Commission for Game %s (Winner: %s, Pot: %s ETB)', NEW.id, v_winner_rec.telegram_user_id, v_total_pot)
            );
          END IF;

        -- Award Bonus Gift Token for the next higher section
        -- 5 ETB -> 10 ETB, 10 -> 15, 15 -> 20, 20 -> 50, 50 -> 100, 100 -> 100 (2 plays)
        DECLARE
          v_src_stake integer := COALESCE(NEW.stake_amount, 10);
          v_bonus_target_slug text;
          v_bonus_target_stake integer;
          v_bonus_plays integer := 1;
        BEGIN
          IF v_src_stake <= 5 THEN
            v_bonus_target_slug := 'starter_room'; v_bonus_target_stake := 10;
          ELSIF v_src_stake <= 10 THEN
            v_bonus_target_slug := 'standard_room'; v_bonus_target_stake := 15;
          ELSIF v_src_stake <= 15 THEN
            v_bonus_target_slug := 'addis_classic'; v_bonus_target_stake := 20;
          ELSIF v_src_stake <= 20 THEN
            v_bonus_target_slug := 'vip_diamond'; v_bonus_target_stake := 50;
          ELSIF v_src_stake <= 50 THEN
            v_bonus_target_slug := 'high_roller'; v_bonus_target_stake := 100;
          ELSE
            v_bonus_target_slug := 'high_roller'; v_bonus_target_stake := 100; v_bonus_plays := 2;
          END IF;

          INSERT INTO bonus_games (
            telegram_user_id,
            target_room_slug,
            target_stake,
            remaining_plays,
            source_game_id,
            source_room_slug
          ) VALUES (
            v_winner_rec.telegram_user_id,
            v_bonus_target_slug,
            v_bonus_target_stake,
            v_bonus_plays,
            NEW.id,
            COALESCE(NEW.room_slug, NEW.room_id)
          );
        EXCEPTION WHEN OTHERS THEN
          NULL; -- Prevent blocking payout if bonus table is pending
        END;

        -- Record winner in period_winners for Daily Super Bonus
        BEGIN
          PERFORM record_period_winner(
            NEW.id,
            COALESCE(NEW.room_id, 'starter_room'),
            COALESCE(NEW.room_slug, 'starter_room'),
            COALESCE(NEW.stake_amount, 10),
            v_winner_rec.telegram_user_id,
            v_winner_rec.admin_id,
            v_prize_amount
          );
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END LOOP;

    NEW.winners_paid = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger for payout_winners_v2
DROP TRIGGER IF EXISTS payout_on_game_finish ON games;
CREATE TRIGGER payout_on_game_finish
  BEFORE UPDATE ON games
  FOR EACH ROW
  WHEN (NEW.status = 'finished' AND OLD.status != 'finished')
  EXECUTE FUNCTION payout_winners_v2();

-- 13. RPC: get_lobby_data_v2 (Filtered by room_id and admin_id)
CREATE OR REPLACE FUNCTION get_lobby_data_v2(
  p_room_id text DEFAULT 'starter_room',
  p_telegram_user_id bigint DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_data jsonb;
  v_user_data jsonb;
  v_taken_nums integer[];
  v_players_data jsonb;
  v_room_data jsonb;
  v_server_time bigint;
  v_default_admin RECORD;
BEGIN
  v_server_time := FLOOR(EXTRACT(EPOCH FROM now() AT TIME ZONE 'UTC') * 1000);

  -- Get room info
  SELECT jsonb_build_object(
    'id', r.id,
    'slug', r.slug,
    'name', r.name,
    'stake_amount', r.stake_amount,
    'min_balance', r.min_balance,
    'display_online_count', r.display_online_count,
    'max_players', r.max_players
  )
  INTO v_room_data
  FROM bingo_rooms r
  WHERE r.id = p_room_id OR r.slug = p_room_id
  LIMIT 1;

  -- Get active/waiting game for this room
  SELECT jsonb_build_object(
    'id', g.id,
    'game_number', g.game_number,
    'status', g.status,
    'total_pot', g.total_pot,
    'stake_amount', g.stake_amount,
    'winner_prize', g.winner_prize,
    'starts_at', FLOOR(EXTRACT(EPOCH FROM g.starts_at AT TIME ZONE 'UTC') * 1000),
    'selection_closed_at', FLOOR(EXTRACT(EPOCH FROM g.selection_closed_at AT TIME ZONE 'UTC') * 1000),
    'room_id', g.room_id,
    'room_slug', g.room_slug
  )
  INTO v_game_data
  FROM games g
  WHERE (g.room_id = p_room_id OR g.room_slug = p_room_id)
    AND g.status IN ('waiting', 'playing')
  ORDER BY g.created_at DESC
  LIMIT 1;

  -- If no game exists, ensure one
  IF v_game_data IS NULL THEN
    PERFORM ensure_room_waiting_game(p_room_id);
    SELECT jsonb_build_object(
      'id', g.id,
      'game_number', g.game_number,
      'status', g.status,
      'total_pot', g.total_pot,
      'stake_amount', g.stake_amount,
      'winner_prize', g.winner_prize,
      'starts_at', FLOOR(EXTRACT(EPOCH FROM g.starts_at AT TIME ZONE 'UTC') * 1000),
      'selection_closed_at', FLOOR(EXTRACT(EPOCH FROM g.selection_closed_at AT TIME ZONE 'UTC') * 1000),
      'room_id', g.room_id,
      'room_slug', g.room_slug
    )
    INTO v_game_data
    FROM games g
    WHERE (g.room_id = p_room_id OR g.room_slug = p_room_id)
      AND g.status IN ('waiting', 'playing')
    ORDER BY g.created_at DESC
    LIMIT 1;
  END IF;

  IF v_game_data IS NOT NULL THEN
    SELECT array_agg(p.selected_number)
    INTO v_taken_nums
    FROM players p
    WHERE p.game_id = (v_game_data->>'id')::uuid;

    SELECT jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'selected_number', p.selected_number,
        'name', p.name,
        'telegram_user_id', p.telegram_user_id,
        'admin_id', p.admin_id
      )
    )
    INTO v_players_data
    FROM players p
    WHERE p.game_id = (v_game_data->>'id')::uuid;
  END IF;

  -- Fetch user balance scoped to selected admin
  IF p_telegram_user_id IS NOT NULL THEN
    IF p_admin_id IS NULL THEN
      SELECT id INTO p_admin_id FROM admins WHERE slug = 'parcelic' LIMIT 1;
    END IF;

    SELECT jsonb_build_object(
      'telegram_user_id', p_telegram_user_id,
      'admin_id', p_admin_id,
      'balance', (COALESCE(w.deposited_balance, 0) + COALESCE(w.won_balance, 0)),
      'deposited_balance', COALESCE(w.deposited_balance, 0),
      'won_balance', COALESCE(w.won_balance, 0),
      'telegram_username', tu.telegram_username,
      'telegram_first_name', tu.telegram_first_name
    )
    INTO v_user_data
    FROM telegram_users tu
    LEFT JOIN admin_user_wallets w ON w.telegram_user_id = tu.telegram_user_id AND w.admin_id = p_admin_id
    WHERE tu.telegram_user_id = p_telegram_user_id;
  END IF;

  RETURN jsonb_build_object(
    'server_time', v_server_time,
    'room', v_room_data,
    'game', v_game_data,
    'taken_numbers', COALESCE(v_taken_nums, ARRAY[]::integer[]),
    'players', COALESCE(v_players_data, '[]'::jsonb),
    'user', v_user_data
  );
END;
$$;

-- 14. Enable Row Level Security and grant execute permissions
ALTER TABLE games_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_game_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on games_catalog" ON games_catalog FOR SELECT USING (true);
CREATE POLICY "Allow public read on bingo_rooms" ON bingo_rooms FOR SELECT USING (true);
CREATE POLICY "Allow public read on admins" ON admins FOR SELECT USING (true);
CREATE POLICY "Allow users to view their admin wallets" ON admin_user_wallets FOR SELECT USING (true);
CREATE POLICY "Allow public read on commissions" ON admin_game_commissions FOR SELECT USING (true);

GRANT EXECUTE ON FUNCTION ensure_room_waiting_game(text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION admin_adjust_user_credit(uuid, bigint, integer, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION select_card_atomic_v2(uuid, integer, bigint, uuid, text, jsonb, jsonb, jsonb, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_lobby_data_v2(text, bigint, uuid) TO anon, authenticated, service_role;

-- Pre-seed initial waiting games for all 6 rooms right away
DO $$
BEGIN
  PERFORM ensure_room_waiting_game('beginner_room');
  PERFORM ensure_room_waiting_game('starter_room');
  PERFORM ensure_room_waiting_game('standard_room');
  PERFORM ensure_room_waiting_game('addis_classic');
  PERFORM ensure_room_waiting_game('vip_diamond');
  PERFORM ensure_room_waiting_game('high_roller');
END $$;


-- 15. Dynamic Pot & Winner Prize Updates with < 5 Players 100% Rule
CREATE OR REPLACE FUNCTION update_game_pot()
RETURNS TRIGGER AS $$
DECLARE
  v_player_count integer;
  v_new_pot integer;
BEGIN
  SELECT COALESCE(total_pot, 0) + COALESCE(stake_amount, 10)
  INTO v_new_pot
  FROM games
  WHERE id = NEW.game_id;

  SELECT COUNT(*)
  INTO v_player_count
  FROM players
  WHERE game_id = NEW.game_id;

  -- If players < 5: winner takes 100% of pot (no admin commission)
  -- If players >= 5: winner takes 90% (10% commission goes to winner's admin)
  IF v_player_count < 5 THEN
    UPDATE games
    SET
      total_pot = v_new_pot,
      winner_prize = v_new_pot
    WHERE id = NEW.game_id;
  ELSE
    UPDATE games
    SET
      total_pot = v_new_pot,
      winner_prize = FLOOR(v_new_pot * 0.90)
    WHERE id = NEW.game_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refund_player_stake()
RETURNS TRIGGER AS $$
DECLARE
  v_remaining_players integer;
  v_new_pot integer;
BEGIN
  SELECT GREATEST(COALESCE(total_pot, 0) - COALESCE(stake_amount, 10), 0)
  INTO v_new_pot
  FROM games
  WHERE id = OLD.game_id;

  SELECT COUNT(*)
  INTO v_remaining_players
  FROM players
  WHERE game_id = OLD.game_id;

  IF v_remaining_players < 5 THEN
    UPDATE games
    SET
      total_pot = v_new_pot,
      winner_prize = v_new_pot
    WHERE id = OLD.game_id;
  ELSE
    UPDATE games
    SET
      total_pot = v_new_pot,
      winner_prize = FLOOR(v_new_pot * 0.90)
    WHERE id = OLD.game_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;


-- 16. Addis Daily Lotto: 12-Hour Morning to Evening Lottery System
-- Minimum 5 ETB gives 1 token; Multiples of 5 ETB grant multiple tokens.
CREATE TABLE IF NOT EXISTS daily_lotto_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number serial,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'drawing', 'settled', 'cancelled')),
  ticket_price integer NOT NULL DEFAULT 5,
  total_pot integer NOT NULL DEFAULT 0,
  total_tickets integer NOT NULL DEFAULT 0,
  winner_ticket_id uuid,
  winner_ticket_number integer,
  winner_telegram_user_id bigint,
  winner_admin_id uuid REFERENCES admins(id),
  winner_prize integer NOT NULL DEFAULT 0,
  admin_commission numeric(12, 2) NOT NULL DEFAULT 0,
  settled_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_lotto_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES daily_lotto_rounds(id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  admin_id uuid REFERENCES admins(id),
  ticket_number integer NOT NULL,
  stake_amount integer NOT NULL DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lotto_tickets_round ON daily_lotto_tickets(round_id);
CREATE INDEX IF NOT EXISTS idx_lotto_tickets_user ON daily_lotto_tickets(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_lotto_rounds_status ON daily_lotto_rounds(status);

-- Seed initial open round if none exists
INSERT INTO daily_lotto_rounds (status, opened_at, closes_at, ticket_price, total_pot, total_tickets)
SELECT 'open', now(), now() + interval '12 hours', 5, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM daily_lotto_rounds WHERE status = 'open');

-- Function to buy Addis Daily Lotto tokens
CREATE OR REPLACE FUNCTION buy_daily_lotto_tokens(
  p_telegram_user_id bigint,
  p_admin_id uuid,
  p_stake_amount integer
)
RETURNS jsonb AS $$
DECLARE
  v_round RECORD;
  v_token_count integer;
  v_start_ticket_num integer;
  v_wallet RECORD;
  v_current_balance numeric;
  v_new_balance numeric;
  v_ticket_numbers integer[] := '{}';
  v_i integer;
BEGIN
  -- Validate stake is minimum 5 ETB and multiple of 5
  IF p_stake_amount < 5 OR (p_stake_amount % 5) != 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stake must be minimum 5 ETB and a multiple of 5 ETB');
  END IF;

  v_token_count := p_stake_amount / 5;

  -- Find or create open round
  SELECT * INTO v_round
  FROM daily_lotto_rounds
  WHERE status = 'open' AND closes_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO daily_lotto_rounds (status, opened_at, closes_at, ticket_price, total_pot, total_tickets)
    VALUES ('open', now(), now() + interval '12 hours', 5, 0, 0)
    RETURNING * INTO v_round;
  END IF;

  -- Check user wallet balance
  IF p_admin_id IS NOT NULL THEN
    SELECT * INTO v_wallet
    FROM admin_user_wallets
    WHERE admin_id = p_admin_id AND telegram_user_id = p_telegram_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Wallet not found with selected admin');
    END IF;

    v_current_balance := COALESCE(v_wallet.deposited_balance, 0) + COALESCE(v_wallet.won_balance, 0);
    IF v_current_balance < p_stake_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance. Please deposit with admin.');
    END IF;

    -- Deduct from deposited_balance first, then won_balance
    IF v_wallet.deposited_balance >= p_stake_amount THEN
      UPDATE admin_user_wallets
      SET
        deposited_balance = deposited_balance - p_stake_amount,
        total_spent = total_spent + p_stake_amount,
        updated_at = now()
      WHERE id = v_wallet.id;
    ELSE
      DECLARE
        v_rem integer := p_stake_amount - v_wallet.deposited_balance;
      BEGIN
        UPDATE admin_user_wallets
        SET
          deposited_balance = 0,
          won_balance = won_balance - v_rem,
          total_spent = total_spent + p_stake_amount,
          updated_at = now()
        WHERE id = v_wallet.id;
      END;
    END IF;

    -- Log transaction
    INSERT INTO admin_ledger_transactions (
      admin_id,
      telegram_user_id,
      type,
      amount,
      description
    ) VALUES (
      p_admin_id,
      p_telegram_user_id,
      'stake_deducted',
      p_stake_amount,
      format('Addis Daily Lotto: %s tokens bought for Round #%s', v_token_count, v_round.round_number)
    );
  ELSE
    -- Legacy user fallback
    SELECT (COALESCE(deposited_balance, 0) + COALESCE(won_balance, 0)) AS total
    INTO v_current_balance
    FROM telegram_users
    WHERE telegram_user_id = p_telegram_user_id;

    IF v_current_balance < p_stake_amount THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance.');
    END IF;

    UPDATE telegram_users
    SET
      balance = balance - p_stake_amount,
      deposited_balance = GREATEST(deposited_balance - p_stake_amount, 0)
    WHERE telegram_user_id = p_telegram_user_id;
  END IF;

  -- Determine ticket starting number
  SELECT COALESCE(MAX(ticket_number), 0) + 1
  INTO v_start_ticket_num
  FROM daily_lotto_tickets
  WHERE round_id = v_round.id;

  -- Generate ticket records
  FOR v_i IN 0..(v_token_count - 1) LOOP
    INSERT INTO daily_lotto_tickets (
      round_id,
      telegram_user_id,
      admin_id,
      ticket_number,
      stake_amount
    ) VALUES (
      v_round.id,
      p_telegram_user_id,
      p_admin_id,
      v_start_ticket_num + v_i,
      5
    );
    v_ticket_numbers := array_append(v_ticket_numbers, v_start_ticket_num + v_i);
  END LOOP;

  -- Update round total pot and tickets count
  UPDATE daily_lotto_rounds
  SET
    total_pot = total_pot + p_stake_amount,
    total_tickets = total_tickets + v_token_count
  WHERE id = v_round.id;

  RETURN jsonb_build_object(
    'success', true,
    'round_id', v_round.id,
    'round_number', v_round.round_number,
    'tokens_bought', v_token_count,
    'ticket_numbers', v_ticket_numbers,
    'stake_amount', p_stake_amount,
    'closes_at', v_round.closes_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Settle Addis Daily Lotto Round
CREATE OR REPLACE FUNCTION settle_daily_lotto_round(p_round_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_round RECORD;
  v_winning_ticket RECORD;
  v_unique_players integer;
  v_admin_commission numeric := 0;
  v_winner_prize integer := 0;
BEGIN
  SELECT * INTO v_round
  FROM daily_lotto_rounds
  WHERE id = p_round_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round not found');
  END IF;

  IF v_round.status != 'open' AND v_round.status != 'drawing' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round already settled');
  END IF;

  IF v_round.total_tickets = 0 THEN
    UPDATE daily_lotto_rounds
    SET status = 'cancelled', settled_at = now()
    WHERE id = p_round_id;
    RETURN jsonb_build_object('success', true, 'status', 'cancelled', 'reason', 'No tickets bought');
  END IF;

  -- Pick random winning ticket
  SELECT * INTO v_winning_ticket
  FROM daily_lotto_tickets
  WHERE round_id = p_round_id
  ORDER BY random()
  LIMIT 1;

  -- Count distinct players in this round
  SELECT COUNT(DISTINCT telegram_user_id)
  INTO v_unique_players
  FROM daily_lotto_tickets
  WHERE round_id = p_round_id;

  -- Rule 6 & 1:
  -- If players < 5: winner takes 100% of pot, admin commission = 0
  -- If players >= 5: winner takes 90%, 10% commission goes to winner's admin
  IF v_unique_players < 5 THEN
    v_admin_commission := 0;
    v_winner_prize := v_round.total_pot;
  ELSE
    v_admin_commission := ROUND(v_round.total_pot * 0.10, 2);
    v_winner_prize := FLOOR(v_round.total_pot * 0.90);
  END IF;

  -- Credit winning user under their admin
  IF v_winning_ticket.admin_id IS NOT NULL THEN
    UPDATE admin_user_wallets
    SET
      won_balance = won_balance + v_winner_prize,
      total_won = total_won + v_winner_prize,
      win_count = win_count + 1,
      updated_at = now()
    WHERE admin_id = v_winning_ticket.admin_id
      AND telegram_user_id = v_winning_ticket.telegram_user_id;

    INSERT INTO admin_ledger_transactions (
      admin_id,
      telegram_user_id,
      type,
      amount,
      description
    ) VALUES (
      v_winning_ticket.admin_id,
      v_winning_ticket.telegram_user_id,
      'win_credited',
      v_winner_prize,
      format('Addis Daily Lotto WINNER! Round #%s Ticket #%s (Prize: %s ETB)', v_round.round_number, v_winning_ticket.ticket_number, v_winner_prize)
    );

    -- Credit 10% commission to winning user's admin if 5+ players
    IF v_unique_players >= 5 AND v_admin_commission > 0 THEN
      UPDATE admins
      SET
        float_balance = float_balance + v_admin_commission,
        total_commission_earned = total_commission_earned + v_admin_commission,
        updated_at = now()
      WHERE id = v_winning_ticket.admin_id;

      INSERT INTO admin_ledger_transactions (
        admin_id,
        telegram_user_id,
        type,
        amount,
        description
      ) VALUES (
        v_winning_ticket.admin_id,
        v_winning_ticket.telegram_user_id,
        'commission_earned',
        v_admin_commission,
        format('10%% Winner Admin Commission for Lotto Round #%s (Winner: %s, Pot: %s ETB)', v_round.round_number, v_winning_ticket.telegram_user_id, v_round.total_pot)
      );
    END IF;
  ELSE
    -- Legacy user credit
    UPDATE telegram_users
    SET
      won_balance = won_balance + v_winner_prize,
      balance = balance + v_winner_prize,
      total_won = total_won + v_winner_prize,
      win_count = win_count + 1
    WHERE telegram_user_id = v_winning_ticket.telegram_user_id;
  END IF;

  -- Update round to settled
  UPDATE daily_lotto_rounds
  SET
    status = 'settled',
    winner_ticket_id = v_winning_ticket.id,
    winner_ticket_number = v_winning_ticket.ticket_number,
    winner_telegram_user_id = v_winning_ticket.telegram_user_id,
    winner_admin_id = v_winning_ticket.admin_id,
    winner_prize = v_winner_prize,
    admin_commission = v_admin_commission,
    settled_at = now()
  WHERE id = p_round_id;

  -- Automatically open next 12-hour round
  INSERT INTO daily_lotto_rounds (status, opened_at, closes_at, ticket_price, total_pot, total_tickets)
  VALUES ('open', now(), now() + interval '12 hours', 5, 0, 0);

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'round_number', v_round.round_number,
    'winning_ticket_number', v_winning_ticket.ticket_number,
    'winner_user_id', v_winning_ticket.telegram_user_id,
    'winner_prize', v_winner_prize,
    'admin_commission', v_admin_commission,
    'unique_players', v_unique_players
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 17. Bonus / Free Games Gift Token Engine
-- When a user wins Bingo, they automatically receive a gift token to play the next higher tier section.
-- Section progression: 5 ETB -> 10 ETB -> 15 ETB -> 20 ETB -> 50 ETB -> 100 ETB.
-- If user wins in 100 ETB, they receive 2 gift tokens to play the 100 ETB section again.
-- Restriction: Gift tokens can ONLY be used when the game session has >= 12 players.
CREATE TABLE IF NOT EXISTS bonus_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL,
  target_room_slug text NOT NULL,
  target_stake integer NOT NULL,
  remaining_plays integer NOT NULL DEFAULT 1 CHECK (remaining_plays >= 0),
  source_game_id uuid REFERENCES games(id),
  source_room_slug text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_games_user ON bonus_games(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_bonus_games_user_room ON bonus_games(telegram_user_id, target_room_slug);

-- RPC to claim / use a bonus game token for a round (requires >= 12 players in room)
CREATE OR REPLACE FUNCTION use_bonus_game_token(
  p_telegram_user_id bigint,
  p_target_room_slug text,
  p_game_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_bonus RECORD;
  v_players_count integer;
BEGIN
  -- Check player count in the target game (must be >= 12 players to use bonus token)
  SELECT COUNT(*) INTO v_players_count
  FROM players
  WHERE game_id = p_game_id;

  IF v_players_count < 12 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bonus gift tokens can only be used in sessions with 12 or more players (Current: ' || v_players_count || ' players)'
    );
  END IF;

  -- Find available bonus game token
  SELECT * INTO v_bonus
  FROM bonus_games
  WHERE telegram_user_id = p_telegram_user_id
    AND target_room_slug = p_target_room_slug
    AND remaining_plays > 0
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No bonus gift token available for this room');
  END IF;

  -- Deduct one play
  UPDATE bonus_games
  SET remaining_plays = remaining_plays - 1, updated_at = now()
  WHERE id = v_bonus.id;

  RETURN jsonb_build_object(
    'success', true,
    'bonus_id', v_bonus.id,
    'target_stake', v_bonus.target_stake,
    'remaining_plays', v_bonus.remaining_plays - 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 18. 24 Hourly Periods (GMT+3 Addis Ababa) & Daily Super Bonus System
-- Timezone: GMT+3 (East Africa Time).
-- Period 1 is 00:00 - 00:59 EAT, Period 24 is 23:00 - 23:59 EAT.
-- Up to 10 continuous games per period with 30s intervals.
-- Daily Super Bonus Qualification Criteria:
-- 1. At least 24 games finished on that day.
-- 2. At least 10 distinct winning candidates (each user represented only once).
-- Super Bonus Tiers: 5 ETB -> 500 ETB, 10 -> 1000, 15 -> 1500, 20 -> 2000, 50 -> 5000, 100 -> 10000.
-- Credited directly to deposited_balance to maintain gameplay liquidity.
CREATE TABLE IF NOT EXISTS period_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_date date NOT NULL DEFAULT DATE(now() AT TIME ZONE 'UTC' + interval '3 hours'),
  period_number integer NOT NULL CHECK (period_number BETWEEN 1 AND 24),
  room_id text NOT NULL,
  room_slug text,
  room_stake integer NOT NULL DEFAULT 10,
  game_id uuid REFERENCES games(id),
  telegram_user_id bigint NOT NULL,
  admin_id uuid REFERENCES admins(id),
  prize_amount integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_period_winners_date ON period_winners(period_date, period_number);
CREATE INDEX IF NOT EXISTS idx_period_winners_user ON period_winners(telegram_user_id);

CREATE TABLE IF NOT EXISTS daily_super_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_date date UNIQUE NOT NULL DEFAULT DATE(now() AT TIME ZONE 'UTC' + interval '3 hours'),
  winner_telegram_user_id bigint,
  winner_admin_id uuid REFERENCES admins(id),
  super_bonus_amount integer NOT NULL DEFAULT 500,
  winning_period_number integer,
  highest_stake integer NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'drawn', 'credited')),
  drawn_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Function to record period winner (GMT+3 EAT)
CREATE OR REPLACE FUNCTION record_period_winner(
  p_game_id uuid,
  p_room_id text,
  p_room_slug text,
  p_room_stake integer,
  p_telegram_user_id bigint,
  p_admin_id uuid,
  p_prize integer
)
RETURNS void AS $$
DECLARE
  v_eat_now timestamptz;
  v_current_hour integer;
  v_period_number integer;
  v_period_date date;
BEGIN
  -- Convert to GMT+3 (East Africa Time)
  v_eat_now := now() AT TIME ZONE 'UTC' + interval '3 hours';
  v_current_hour := EXTRACT(HOUR FROM v_eat_now)::integer;
  v_period_number := v_current_hour + 1; -- 1 to 24
  v_period_date := DATE(v_eat_now);

  INSERT INTO period_winners (
    period_date,
    period_number,
    room_id,
    room_slug,
    room_stake,
    game_id,
    telegram_user_id,
    admin_id,
    prize_amount
  ) VALUES (
    v_period_date,
    v_period_number,
    p_room_id,
    p_room_slug,
    COALESCE(p_room_stake, 10),
    p_game_id,
    p_telegram_user_id,
    p_admin_id,
    p_prize
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to draw the Daily Super Bonus with GMT+3, >=24 games, and >=10 distinct candidates criteria
CREATE OR REPLACE FUNCTION draw_daily_super_bonus(p_date date DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_draw_date date;
  v_total_games_today integer;
  v_distinct_candidates integer;
  v_candidate RECORD;
  v_bonus RECORD;
  v_bonus_amount integer;
BEGIN
  -- Default to today in GMT+3 (East Africa Time)
  IF p_date IS NULL THEN
    v_draw_date := DATE(now() AT TIME ZONE 'UTC' + interval '3 hours');
  ELSE
    v_draw_date := p_date;
  END IF;

  -- 1. Check if already drawn and credited for this date
  SELECT * INTO v_bonus FROM daily_super_bonuses WHERE draw_date = v_draw_date;
  IF FOUND AND v_bonus.status = 'credited' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Daily Super Bonus already credited for date ' || v_draw_date);
  END IF;

  -- 2. Criterion 1: At least 24 games played on that day
  SELECT COUNT(*) INTO v_total_games_today
  FROM games
  WHERE DATE(finished_at AT TIME ZONE 'UTC' + interval '3 hours') = v_draw_date
    AND status = 'finished';

  IF v_total_games_today < 24 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Daily Super Bonus requires at least 24 games played today (Current: ' || v_total_games_today || ' games on ' || v_draw_date || ')'
    );
  END IF;

  -- 3. Criterion 2: At least 10 distinct winning candidates
  SELECT COUNT(DISTINCT telegram_user_id) INTO v_distinct_candidates
  FROM period_winners
  WHERE period_date = v_draw_date;

  IF v_distinct_candidates < 10 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Daily Super Bonus requires at least 10 distinct candidates (Current: ' || v_distinct_candidates || ' candidates on ' || v_draw_date || ')'
    );
  END IF;

  -- 4. Select ONE lucky user among the distinct candidates (each user represented only once)
  SELECT
    pw.telegram_user_id,
    pw.admin_id,
    MAX(pw.room_stake) as highest_stake,
    MAX(pw.period_number) as winning_period
  INTO v_candidate
  FROM period_winners pw
  WHERE pw.period_date = v_draw_date
  GROUP BY pw.telegram_user_id, pw.admin_id
  ORDER BY random()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No candidate found for draw');
  END IF;

  -- 5. Calculate Mega Super Bonus amount based on the section stake:
  -- Section 5 birr -> 500 birr mega bonus
  -- Section 10 birr -> 1000 birr
  -- Section 15 birr -> 1500 birr
  -- Section 20 birr -> 2000 birr
  -- Section 50 birr -> 5000 birr
  -- Section 100 birr -> 10000 birr
  IF v_candidate.highest_stake <= 5 THEN
    v_bonus_amount := 500;
  ELSIF v_candidate.highest_stake <= 10 THEN
    v_bonus_amount := 1000;
  ELSIF v_candidate.highest_stake <= 15 THEN
    v_bonus_amount := 1500;
  ELSIF v_candidate.highest_stake <= 20 THEN
    v_bonus_amount := 2000;
  ELSIF v_candidate.highest_stake <= 50 THEN
    v_bonus_amount := 5000;
  ELSE
    v_bonus_amount := 10000;
  END IF;

  -- 6. Add bonus to user's DEPOSITED_BALANCE (avoid cashout loops, keeping liquidity in gameplay)
  IF v_candidate.admin_id IS NOT NULL THEN
    UPDATE admin_user_wallets
    SET
      deposited_balance = deposited_balance + v_bonus_amount,
      updated_at = now()
    WHERE admin_id = v_candidate.admin_id AND telegram_user_id = v_candidate.telegram_user_id;

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
      format('🎉 DAILY MEGA SUPER BONUS! %s ETB credited to Deposited Balance (Section Stake: %s ETB, Period: %s)', v_bonus_amount, v_candidate.highest_stake, v_candidate.winning_period)
    );
  ELSE
    UPDATE telegram_users
    SET
      deposited_balance = deposited_balance + v_bonus_amount,
      balance = balance + v_bonus_amount
    WHERE telegram_user_id = v_candidate.telegram_user_id;
  END IF;

  -- 7. Record / Update daily_super_bonuses record
  INSERT INTO daily_super_bonuses (
    draw_date,
    winner_telegram_user_id,
    winner_admin_id,
    super_bonus_amount,
    winning_period_number,
    highest_stake,
    status,
    drawn_at
  ) VALUES (
    v_draw_date,
    v_candidate.telegram_user_id,
    v_candidate.admin_id,
    v_bonus_amount,
    v_candidate.winning_period,
    v_candidate.highest_stake,
    'credited',
    now()
  )
  ON CONFLICT (draw_date) DO UPDATE SET
    winner_telegram_user_id = EXCLUDED.winner_telegram_user_id,
    winner_admin_id = EXCLUDED.winner_admin_id,
    super_bonus_amount = EXCLUDED.super_bonus_amount,
    winning_period_number = EXCLUDED.winning_period_number,
    highest_stake = EXCLUDED.highest_stake,
    status = 'credited',
    drawn_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'draw_date', v_draw_date,
    'winner_telegram_user_id', v_candidate.telegram_user_id,
    'section_stake', v_candidate.highest_stake,
    'super_bonus_amount', v_bonus_amount,
    'winning_period_number', v_candidate.winning_period,
    'total_games_today', v_total_games_today,
    'distinct_candidates', v_distinct_candidates
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 19. Edge Case: Refund Unclaimed Game (e.g. all 75 numbers called without winner)
CREATE OR REPLACE FUNCTION refund_unclaimed_game(p_game_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_game RECORD;
  v_player RECORD;
  v_refunded_count integer := 0;
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;

  IF v_game.status != 'finished' OR (v_game.winner_ids IS NOT NULL AND array_length(v_game.winner_ids, 1) > 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is not an unclaimed finished game');
  END IF;

  FOR v_player IN SELECT * FROM players WHERE game_id = p_game_id LOOP
    IF v_player.admin_id IS NOT NULL THEN
      UPDATE admin_user_wallets
      SET deposited_balance = deposited_balance + COALESCE(v_game.stake_amount, 10), updated_at = now()
      WHERE admin_id = v_player.admin_id AND telegram_user_id = v_player.telegram_user_id;

      INSERT INTO admin_ledger_transactions (
        admin_id, telegram_user_id, game_id, type, amount, description
      ) VALUES (
        v_player.admin_id, v_player.telegram_user_id, p_game_id, 'deposit_credited',
        COALESCE(v_game.stake_amount, 10), 'Refund: Game finished with no Bingo claims'
      );
    ELSE
      UPDATE telegram_users
      SET balance = balance + COALESCE(v_game.stake_amount, 10), deposited_balance = deposited_balance + COALESCE(v_game.stake_amount, 10)
      WHERE telegram_user_id = v_player.telegram_user_id;
    END IF;
    v_refunded_count := v_refunded_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'refunded_players', v_refunded_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
