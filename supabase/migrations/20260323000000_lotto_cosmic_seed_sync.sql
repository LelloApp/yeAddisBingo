-- Migration: 20260323000000_lotto_cosmic_seed_sync.sql
-- Enables single-source-of-truth 9-digit cosmic distance seeds for Daily Lotto and Super Bonus Lotto
-- Highly optimized for minimal database read/writes: single write per round, zero polling loops.

ALTER TABLE daily_lotto_rounds 
  ADD COLUMN IF NOT EXISTS cosmic_distance_seed bigint,
  ADD COLUMN IF NOT EXISTS cosmic_seed_recorded_at timestamptz;

ALTER TABLE daily_lotto_super_bonus_rounds 
  ADD COLUMN IF NOT EXISTS cosmic_distance_seed bigint,
  ADD COLUMN IF NOT EXISTS cosmic_seed_recorded_at timestamptz;

CREATE OR REPLACE FUNCTION sync_or_record_lotto_cosmic_seed(
  p_round_id uuid,
  p_is_super_bonus boolean DEFAULT false,
  p_client_seed bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recorded_seed bigint;
BEGIN
  IF p_is_super_bonus THEN
    SELECT cosmic_distance_seed INTO v_recorded_seed
    FROM daily_lotto_super_bonus_rounds
    WHERE id = p_round_id;

    IF v_recorded_seed IS NULL AND p_client_seed IS NOT NULL AND p_client_seed > 0 THEN
      UPDATE daily_lotto_super_bonus_rounds
      SET cosmic_distance_seed = p_client_seed,
          cosmic_seed_recorded_at = now()
      WHERE id = p_round_id AND cosmic_distance_seed IS NULL;

      SELECT cosmic_distance_seed INTO v_recorded_seed
      FROM daily_lotto_super_bonus_rounds
      WHERE id = p_round_id;
    END IF;
  ELSE
    SELECT cosmic_distance_seed INTO v_recorded_seed
    FROM daily_lotto_rounds
    WHERE id = p_round_id;

    IF v_recorded_seed IS NULL AND p_client_seed IS NOT NULL AND p_client_seed > 0 THEN
      UPDATE daily_lotto_rounds
      SET cosmic_distance_seed = p_client_seed,
          cosmic_seed_recorded_at = now()
      WHERE id = p_round_id AND cosmic_distance_seed IS NULL;

      SELECT cosmic_distance_seed INTO v_recorded_seed
      FROM daily_lotto_rounds
      WHERE id = p_round_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'seed', v_recorded_seed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION sync_or_record_lotto_cosmic_seed(uuid, boolean, bigint) TO authenticated, anon;
