import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Game {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  current_number: number | null;
  called_numbers: number[];
  host_id: string;
  winner_ids: string[];
  winner_prize_each: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  starts_at: string;
  game_number: number;
  stake_amount: number;
  total_pot: number;
  winner_prize: number;
  claim_window_start: string | null;
  return_to_lobby_at: string | null;
  room_id?: string;
  room_slug?: string;
}

export interface Player {
  id: string;
  game_id: string;
  name: string;
  card: number[][];
  card_numbers: number[][];
  marked_cells: boolean[][];
  is_host: boolean;
  joined_at: string;
  is_connected: boolean;
  selected_number: number;
  is_disqualified: boolean;
  disqualified_at: string | null;
  stake_paid: boolean;
  admin_id?: string;
  wallet_id?: string;
  winning_pattern?: {
    type: string;
    description: string;
    cells: [number, number][];
  } | null;
}

export interface BingoRoom {
  id: string;
  slug: string;
  name: string;
  theme_icon?: string;
  stake_amount: number;
  min_balance: number;
  display_online_count: number;
  max_players?: number;
  is_active?: boolean;
}

export interface Admin {
  id: string;
  slug: string;
  display_name: string;
  telegram_username: string;
  telegram_user_id?: number;
  commission_rate?: number;
  float_balance?: number;
}

export interface GameCatalogItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  badge?: string;
  status: 'active' | 'coming_soon' | 'maintenance';
}

export interface AdminUserWallet {
  id: string;
  telegram_user_id: number;
  admin_id: string;
  deposited_balance: number;
  won_balance: number;
  total_spent: number;
  total_won: number;
  win_count: number;
}

export interface DailyLottoRound {
  id: string;
  round_number: number;
  opened_at: string;
  closes_at: string;
  status: 'open' | 'drawing' | 'settled' | 'cancelled';
  ticket_price: number;
  total_pot: number;
  total_tickets: number;
  winner_ticket_id?: string;
  winner_ticket_number?: number;
  winner_telegram_user_id?: number;
  winner_admin_id?: string;
  winner_prize: number;
  admin_commission: number;
  settled_at?: string;
}

export interface DailyLottoTicket {
  id: string;
  round_id: string;
  telegram_user_id: number;
  admin_id?: string;
  ticket_number: number;
  stake_amount: number;
  created_at: string;
}

export interface BonusGame {
  id: string;
  telegram_user_id: number;
  target_room_slug: string;
  target_stake: number;
  remaining_plays: number;
  source_game_id?: string;
  source_room_slug?: string;
  created_at: string;
}

export interface PeriodWinner {
  id: string;
  period_date: string;
  period_number: number;
  room_id: string;
  room_slug?: string;
  room_stake: number;
  game_id?: string;
  telegram_user_id: number;
  admin_id?: string;
  prize_amount: number;
  created_at: string;
}

export interface DailySuperBonus {
  id: string;
  draw_date: string;
  room_slug: string;
  room_stake: number;
  winner_telegram_user_id?: number;
  winner_admin_id?: string;
  super_bonus_amount: number;
  winning_period_number?: number;
  highest_stake: number;
  status: 'pending' | 'drawn' | 'credited';
  drawn_at?: string;
}

