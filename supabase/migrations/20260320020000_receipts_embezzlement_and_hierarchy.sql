-- Migration: 20260320020000_receipts_embezzlement_and_hierarchy.sql
-- Description: Receipt image attachments across entire credit hierarchy,
--              dispute & embezzlement reporting, user confirmation of cashout,
--              and owner manage super admin RPC.

-- 1. Add columns to user_financial_requests
ALTER TABLE user_financial_requests
ADD COLUMN IF NOT EXISTS receipt_image_url text,
ADD COLUMN IF NOT EXISTS admin_receipt_image_url text,
ADD COLUMN IF NOT EXISTS user_confirmed_cashout boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_flagged_embezzlement boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS flag_reason text,
ADD COLUMN IF NOT EXISTS flag_reported_by bigint,
ADD COLUMN IF NOT EXISTS flag_resolved_at timestamptz,
ADD COLUMN IF NOT EXISTS flag_resolution_notes text;

ALTER TABLE user_financial_requests
ALTER COLUMN parsed_transaction_id DROP NOT NULL;

-- 2. Receipt image attachments for Admin Credit Requests
ALTER TABLE admin_credit_requests
ADD COLUMN IF NOT EXISTS receipt_image_url text;

ALTER TABLE admin_credit_requests
ALTER COLUMN parsed_transaction_id DROP NOT NULL;

-- 3. Receipt image attachments for Super Admin Credit Purchases
ALTER TABLE super_admin_credit_purchases
ADD COLUMN IF NOT EXISTS receipt_image_url text;

ALTER TABLE super_admin_credit_purchases
ALTER COLUMN parsed_transaction_id DROP NOT NULL;

-- 4. RPC: Owner Manage Super Admin (Create or Update with 4-digit PIN and is_active)
CREATE OR REPLACE FUNCTION owner_manage_super_admin(
  p_super_admin_id uuid DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_pin_code text DEFAULT '1234',
  p_float_balance numeric DEFAULT 0,
  p_is_active boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res_id uuid;
BEGIN
  IF p_super_admin_id IS NOT NULL THEN
    UPDATE super_admins
    SET
      display_name = COALESCE(p_display_name, display_name),
      username = COALESCE(p_username, username),
      pin_code = COALESCE(p_pin_code, pin_code),
      float_balance = COALESCE(p_float_balance, float_balance),
      is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_super_admin_id
    RETURNING id INTO v_res_id;

    RETURN jsonb_build_object('success', true, 'action', 'updated', 'super_admin_id', v_res_id);
  ELSE
    INSERT INTO super_admins (
      display_name,
      username,
      pin_code,
      float_balance,
      is_active
    ) VALUES (
      p_display_name,
      p_username,
      COALESCE(p_pin_code, '1234'),
      COALESCE(p_float_balance, 0),
      COALESCE(p_is_active, true)
    ) RETURNING id INTO v_res_id;

    RETURN jsonb_build_object('success', true, 'action', 'created', 'super_admin_id', v_res_id);
  END IF;
END;
$$;

-- 5. RPC: User Confirms Payout Received
CREATE OR REPLACE FUNCTION user_confirm_cashout_receipt(
  p_request_id uuid,
  p_telegram_user_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_financial_requests
  SET user_confirmed_cashout = true
  WHERE id = p_request_id AND telegram_user_id = p_telegram_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. RPC: Report False Receipt / Embezzlement / Miss-Cashout
CREATE OR REPLACE FUNCTION report_embezzlement_or_dispute(
  p_request_id uuid,
  p_reporter_id bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_financial_requests
  SET
    is_flagged_embezzlement = true,
    flag_reason = p_reason,
    flag_reported_by = p_reporter_id
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. RPC: Owner Resolve Embezzlement Dispute
CREATE OR REPLACE FUNCTION owner_resolve_embezzlement_flag(
  p_request_id uuid,
  p_resolution_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_financial_requests
  SET
    is_flagged_embezzlement = false,
    flag_resolved_at = now(),
    flag_resolution_notes = p_resolution_notes
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
