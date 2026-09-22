-- Migration: 20260322000000_payment_accounts_and_five_rooms.sql
-- Description: Add payment account settings for Admins and Super Admins, update rooms to 5 sections

-- 1. Add payment account columns to admins
ALTER TABLE public.admins
ADD COLUMN IF NOT EXISTS telebirr_account text,
ADD COLUMN IF NOT EXISTS telebirr_account_name text,
ADD COLUMN IF NOT EXISTS cbe_account text,
ADD COLUMN IF NOT EXISTS cbe_account_name text,
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS bank_account text,
ADD COLUMN IF NOT EXISTS bank_account_name text;

-- 2. Add payment account columns to super_admins
ALTER TABLE public.super_admins
ADD COLUMN IF NOT EXISTS telebirr_account text,
ADD COLUMN IF NOT EXISTS telebirr_account_name text,
ADD COLUMN IF NOT EXISTS cbe_account text,
ADD COLUMN IF NOT EXISTS cbe_account_name text,
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS bank_account text,
ADD COLUMN IF NOT EXISTS bank_account_name text;

-- Seed default accounts for parcelic if empty
UPDATE public.admins
SET 
  telebirr_account = COALESCE(telebirr_account, '0911000000'),
  telebirr_account_name = COALESCE(telebirr_account_name, 'Parcelic Games'),
  cbe_account = COALESCE(cbe_account, '1000123456789'),
  cbe_account_name = COALESCE(cbe_account_name, 'Parcelic Entertainment')
WHERE slug = 'parcelic';

-- 3. Update 5 Bingo Rooms:
-- Deactivate beginner_room (5 ETB)
UPDATE public.bingo_rooms
SET is_active = false
WHERE id = 'beginner_room' OR slug = 'beginner_room';

-- Update starter_room to 🌱 ጀማሪ (10 ETB)
UPDATE public.bingo_rooms
SET 
  name = '🌱 ጀማሪ (10 ETB)',
  theme_icon = '🌱',
  stake_amount = 10,
  min_balance = 10,
  sort_order = 1,
  is_active = true
WHERE id = 'starter_room' OR slug = 'starter_room';

-- Update standard_room to 🎲 ዱብዱብ (15 ETB)
UPDATE public.bingo_rooms
SET 
  name = '🎲 ዱብዱብ (15 ETB)',
  theme_icon = '🎲',
  stake_amount = 15,
  min_balance = 15,
  sort_order = 2,
  is_active = true
WHERE id = 'standard_room' OR slug = 'standard_room';

-- Update addis_classic to 🏆 ክላሲክ (25 ETB)
UPDATE public.bingo_rooms
SET 
  name = '🏆 ክላሲክ (25 ETB)',
  theme_icon = '🏆',
  stake_amount = 25,
  min_balance = 25,
  sort_order = 3,
  is_active = true
WHERE id = 'addis_classic' OR slug = 'addis_classic';

-- Update vip_diamond to 💎 VIP ዳይመንድ (50 ETB)
UPDATE public.bingo_rooms
SET 
  name = '💎 VIP ዳይመንድ (50 ETB)',
  theme_icon = '💎',
  stake_amount = 50,
  min_balance = 50,
  sort_order = 4,
  is_active = true
WHERE id = 'vip_diamond' OR slug = 'vip_diamond';

-- Update high_roller to 👑 VIP ዘውድ (100 ETB)
UPDATE public.bingo_rooms
SET 
  name = '👑 VIP ዘውድ (100 ETB)',
  theme_icon = '👑',
  stake_amount = 100,
  min_balance = 100,
  sort_order = 5,
  is_active = true
WHERE id = 'high_roller' OR slug = 'high_roller';

-- 4. RPC for Admin to update payment accounts securely
CREATE OR REPLACE FUNCTION public.admin_update_payment_accounts(
  p_admin_id uuid,
  p_telebirr text,
  p_telebirr_name text,
  p_cbe text,
  p_cbe_name text,
  p_bank_name text,
  p_bank_acc text,
  p_bank_acc_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.admins
  SET 
    telebirr_account = p_telebirr,
    telebirr_account_name = p_telebirr_name,
    cbe_account = p_cbe,
    cbe_account_name = p_cbe_name,
    bank_name = p_bank_name,
    bank_account = p_bank_acc,
    bank_account_name = p_bank_acc_name,
    updated_at = now()
  WHERE id = p_admin_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Admin not found');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- 5. RPC for Super Admin to update payment accounts
CREATE OR REPLACE FUNCTION public.super_admin_update_payment_accounts(
  p_super_admin_id uuid,
  p_telebirr text,
  p_telebirr_name text,
  p_cbe text,
  p_cbe_name text,
  p_bank_name text,
  p_bank_acc text,
  p_bank_acc_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.super_admins
  SET 
    telebirr_account = p_telebirr,
    telebirr_account_name = p_telebirr_name,
    cbe_account = p_cbe,
    cbe_account_name = p_cbe_name,
    bank_name = p_bank_name,
    bank_account = p_bank_acc,
    bank_account_name = p_bank_acc_name,
    updated_at = now()
  WHERE id = p_super_admin_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Super Admin not found');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;
