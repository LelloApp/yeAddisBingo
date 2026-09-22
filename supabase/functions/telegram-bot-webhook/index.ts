/// <reference path="../deno.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: {
    id: number;
    type: string;
  };
  text?: string;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: any
) {
  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const body: any = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  const response = await fetch(telegramUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return response.json();
}

async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
  showAlert = false
) {
  const telegramUrl = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;

  const body: any = {
    callback_query_id: callbackQueryId,
    show_alert: showAlert,
  };

  if (text) {
    body.text = text;
  }

  const response = await fetch(telegramUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return response.json();
}

// 1. Fetch Game Catalog (Bingo, Quiz, Chez)
async function getGamesCatalog(supabaseClient: any) {
  try {
    const { data, error } = await supabaseClient
      .from("games_catalog")
      .select("*")
      .order("sort_order", { ascending: true });

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn("Could not query games_catalog table:", err);
  }

  return [
    {
      id: "bingo",
      title: "🎯 የአዲስ ቢንጎ",
      badge: "🔥 LIVE",
      status: "active",
      description: "ፈጣን እና አስተማማኝ የቀጥታ ቢንጎ ጨዋታ ከእውነተኛ አሸናፊዎች ጋር",
    },
    {
      id: "quiz",
      title: "🧠 የቀኑ ጥያቄዎች",
      badge: "⏳ በቅርቡ",
      status: "coming_soon",
      description: "የእውቀት ውድድር እና ፈጣን የጥያቄና መልስ ጨዋታ",
    },
    {
      id: "daily_lotto",
      title: "🎟️ ዕለታዊ ሎቶ (ማታ 12 ሰአት)",
      badge: "🗄️ 100 ETB / እጣ",
      status: "active",
      description: "በየቀኑ ማታ 12 ሰአት የሚወጣ ታላቅ ዕለታዊ ሎቶ (1 እጣ = 100 ብር)",
    },
    {
      id: "super_bonus",
      title: "🌟 ሱፐር ቦነስ ሎቶ (ማታ 1 ሰአት)",
      badge: "🏆 ልዩ ካዝና",
      status: "active",
      description: "በየቀኑ ማታ 1 ሰአት የሚወጣ ሱፐር ቦነስ ሎቶ ለእለቱ አሸናፊዎች",
    },
  ];
}

function buildGamesKeyboard(games: any[], appUrl: string) {
  // Order:
  // 1. የአዲስ ቢንጎ
  // 2. የቀኑ ጥያቄዎች
  // 3. ዕለታዊ ሎቶ (ማታ 12 ሰአት)
  // 4. ሱፐር ቦነስ ሎቶ (ማታ 1 ሰአት)
  // 5. 🎮 ጨዋታውን ይክፈቱ (Only in welcoming entrance menu)
  // 6. 💰 ገቢ ወጪ
  const keyboard: any[][] = games.map((g: any) => [
    {
      text: `${g.title}`,
      callback_data: `choose_game:${g.id}`,
    },
  ]);

  keyboard.push([
    { text: "🎮 ጨዋታውን ይክፈቱ", web_app: { url: appUrl } },
  ]);

  keyboard.push([
    { text: "💰 ገቢ ወጪ", callback_data: "check_balance" },
  ]);

  return { inline_keyboard: keyboard };
}

// 2. Fetch the 5 Active Bingo Rooms (🌱 ጀማሪ 10, 🎲 ዱብዱብ 15, 🏆 ክላሲክ 25, 💎 VIP ዳይመንድ 50, 👑 VIP ዘውድ 100)
async function getBingoRooms(supabaseClient: any) {
  try {
    const { data, error } = await supabaseClient
      .from("bingo_rooms")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn("Could not query bingo_rooms table:", err);
  }

  return [
    {
      id: "starter_room",
      slug: "starter_room",
      name: "🌱 ጀማሪ (10 ETB)",
      theme_icon: "🌱",
      stake_amount: 10,
      min_balance: 10,
      display_online_count: 20,
    },
    {
      id: "standard_room",
      slug: "standard_room",
      name: "🎲 ዱብዱብ (15 ETB)",
      theme_icon: "🎲",
      stake_amount: 15,
      min_balance: 15,
      display_online_count: 30,
    },
    {
      id: "addis_classic",
      slug: "addis_classic",
      name: "🏆 ክላሲክ (25 ETB)",
      theme_icon: "🏆",
      stake_amount: 25,
      min_balance: 25,
      display_online_count: 30,
    },
    {
      id: "vip_diamond",
      slug: "vip_diamond",
      name: "💎 VIP ዳይመንድ (50 ETB)",
      theme_icon: "💎",
      stake_amount: 50,
      min_balance: 50,
      display_online_count: 30,
    },
    {
      id: "high_roller",
      slug: "high_roller",
      name: "👑 VIP ዘውድ (100 ETB)",
      theme_icon: "👑",
      stake_amount: 100,
      min_balance: 100,
      display_online_count: 30,
    },
  ];
}

function buildRoomsKeyboard(rooms: any[]) {
  const keyboard: any[][] = rooms.map((r: any) => [
    {
      text: `${r.name} • ${r.display_online_count || 20} በመስመር ላይ`,
      callback_data: `pick_room:${r.slug || r.id}`,
    },
  ]);

  keyboard.push([
    { text: "🔙 ወደ ዋና ማውጫ (Main Menu)", callback_data: "back_to_games" },
    { text: "💰 ሂሳብ ይመልከቱ (Balance)", callback_data: "check_balance" },
  ]);

  return { inline_keyboard: keyboard };
}

// 3. Fetch Active Admins
async function getActiveAdmins(supabaseClient: any) {
  try {
    const { data, error } = await supabaseClient
      .from("admins")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn("Could not query admins table:", err);
  }

  return [
    {
      id: "00000000-0000-0000-0000-000000000001",
      slug: "parcelic",
      display_name: "Parcelic Admin",
      telegram_username: "parcelic",
      commission_rate: 0.10,
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      slug: "fekadu_kera",
      display_name: "ፍቃዱ ቄራ (Fekadu Kera)",
      telegram_username: "fekadu_kera_bot",
      commission_rate: 0.10,
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      slug: "hasen_stadium",
      display_name: "ሀሰን ስታዲየም (Hasen Stadium)",
      telegram_username: "hasen_stadium_bot",
      commission_rate: 0.10,
    },
  ];
}

function buildAdminsKeyboard(admins: any[], roomSlug: string) {
  const keyboard: any[][] = admins.map((admin: any) => [
    {
      text: `👤 ${admin.display_name} (@${admin.telegram_username.replace(/^@/, '')})`,
      callback_data: `pick_admin:${roomSlug}:${admin.id || admin.slug}`,
    },
  ]);

  keyboard.push([
    { text: "🔙 Change Room", callback_data: "choose_game:bingo" },
    { text: "🔙 Games Menu", callback_data: "back_to_games" },
  ]);

  return { inline_keyboard: keyboard };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: settingData } = await supabaseClient
      .from("settings")
      .select("value")
      .eq("id", "telegram_bot_token")
      .single();

    const botToken = settingData?.value || Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!botToken) {
      return new Response(
        JSON.stringify({ error: "Bot token not configured" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { data: gameUrlData } = await supabaseClient
      .from("settings")
      .select("value")
      .eq("id", "game_url")
      .maybeSingle();
    const appUrl = gameUrlData?.value || "https://yeaddisbingo.web.app";

    const update: TelegramUpdate = await req.json();

    // ==========================================
    // Handle Callback Queries (Interactive Clicks)
    // ==========================================
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message?.chat.id;
      const user = callbackQuery.from;
      const data = callbackQuery.data || "";

      let handled = false;

      // 1. Back to Games Menu
      if (chatId && (data === "back_to_games" || data === "games_menu")) {
        handled = true;
        const games = await getGamesCatalog(supabaseClient);
        await sendTelegramMessage(
          botToken,
          chatId,
          `እንኳን ወደ የአዲስ ጌምስ በደህና መጡ!\n\n🎮 <b>ጨዋታ ይምረጡ:</b>`,
          buildGamesKeyboard(games, appUrl)
        );
        await answerCallbackQuery(botToken, callbackQuery.id);
      }

      // 2. Select Game (Bingo / Quiz / Lotto)
      if (chatId && data.startsWith("choose_game:")) {
        handled = true;
        const selectedGame = data.replace("choose_game:", "");

        if (selectedGame === "bingo") {
          const rooms = await getBingoRooms(supabaseClient);
          await sendTelegramMessage(
            botToken,
            chatId,
            `🎯 <b>የአዲስ ቢንጎ የቀጥታ ክፍሎች</b>\n\n` +
            `ለመጫወት የሚፈልጉትን የክፍል መደብ ይምረጡ:\n` +
            `• በአንድ ጊዜ እስከ 400 ተጫዋቾች ይሳተፋሉ!\n` +
            `• ፈጣን አሸናፊ እና ፈጣን ክፍያ።`,
            buildRoomsKeyboard(rooms)
          );
          await answerCallbackQuery(botToken, callbackQuery.id);
        } else if (selectedGame === "quiz") {
          await answerCallbackQuery(
            botToken,
            callbackQuery.id,
            "🧠 የቀኑ ጥያቄዎች በቅርቡ ይጀምራል! በጥያቄና መልስ ተወዳድረው የገንዘብ ሽልማት ያሸንፉ።",
            true
          );
        } else if (selectedGame === "daily_lotto") {
          const { data: round } = await supabaseClient
            .from("daily_lotto_rounds")
            .select("*")
            .eq("status", "open")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const pot = round?.total_pot || 0;
          const tickets = round?.total_tickets || 0;
          const roundNum = round?.round_number || 1;

          await sendTelegramMessage(
            botToken,
            chatId,
            `🎟️ <b>ዕለታዊ ሎቶ (ማታ 12 ሰአት) - ዙር #${roundNum}</b>\n\n` +
            `⏰ <b>የዕጣ ማውጫ ሰዓት: በየቀኑ ማታ 12 ሰአት</b>\n` +
            `• <b>1 እጣ = 100 ብር</b>\n` +
            `• 🗄️ የወቅቱ ካዝና: <b>${pot} ብር</b> (${tickets} እጣዎች ተሳትፈዋል)\n\n` +
            `ከሂሳብዎ የሚገዙትን የእጣ መጠን ይምረጡ:`,
            {
              inline_keyboard: [
                [
                  { text: "🎟️ 1 እጣ (100 ETB)", callback_data: "lotto_buy:100" },
                  { text: "🎟️ 2 እጣዎች (200 ETB)", callback_data: "lotto_buy:200" }
                ],
                [
                  { text: "🎟️ 5 እጣዎች (500 ETB)", callback_data: "lotto_buy:500" },
                  { text: "🎟️ 10 እጣዎች (1000 ETB)", callback_data: "lotto_buy:1000" }
                ],
                [
                  { text: "🔙 ወደ ዋና ማውጫ", callback_data: "back_to_games" }
                ]
              ]
            }
          );
          await answerCallbackQuery(botToken, callbackQuery.id);
        } else if (selectedGame === "super_bonus") {
          const { data: potData } = await supabaseClient.rpc("get_owner_24h_super_bonus_pot");
          const superPot = potData || 0;

          const { data: userTokens } = await supabaseClient
            .from("daily_lotto_super_bonus_tokens")
            .select("token_count")
            .eq("telegram_user_id", user.id)
            .gte("earned_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());

          const myTokens = userTokens?.reduce((sum: number, t: any) => sum + (t.token_count || 1), 0) || 0;

          await sendTelegramMessage(
            botToken,
            chatId,
            `🌟 <b>ሱፐር ቦነስ ሎቶ (ማታ 1 ሰአት)</b>\n\n` +
            `⏰ <b>የዕጣ ማውጫ ሰዓት: በየቀኑ ማታ 1 ሰአት</b>\n` +
            `• 🗄️ የ24 ሰአት የተጠራቀመ ካዝና: <b>${Number(superPot).toFixed(2)} ብር</b>\n` +
            `• 🎟️ የርስዎ የዛሬ እጣዎች: <b>${myTokens} እጣዎች</b>\n\n` +
            `💡 <b>የእጣ አሰጣጥ:</b>\n` +
            `• በ 25 ETB (ክላሲክ) ሲያሸንፉ (ተጫዋቾች >= 12): <b>1 እጣ</b>\n` +
            `• በ 50 ETB (VIP ዳይመንድ) ሲያሸንፉ (ተጫዋቾች >= 12): <b>2 እጣዎች</b>\n` +
            `• በ 100 ETB (VIP ዘውድ) ሲያሸንፉ (ተጫዋቾች >= 12): <b>4 እጣዎች</b>\n\n` +
            `በቀጥታ በቢንጎ ተሳትፈው እጣዎችን ይሰብስቡ!`,
            {
              inline_keyboard: [
                [{ text: "🎯 ቢንጎ ተጫወቱ", callback_data: "choose_game:bingo" }],
                [{ text: "🔙 ወደ ዋና ማውጫ", callback_data: "back_to_games" }],
              ]
            }
          );
          await answerCallbackQuery(botToken, callbackQuery.id);
        }
      }

      // 2b. Addis Daily Lotto Ticket Purchase Handler
      if (chatId && data.startsWith("lotto_buy:")) {
        handled = true;
        const stakeAmount = parseInt(data.replace("lotto_buy:", ""), 10);

        // Find user wallet and admin
        const { data: userWallet } = await supabaseClient
          .from("admin_user_wallets")
          .select("admin_id, deposited_balance, won_balance")
          .eq("telegram_user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const adminId = userWallet?.admin_id || null;

        const { data: buyRes, error: buyErr } = await supabaseClient.rpc("buy_daily_lotto_tokens", {
          p_telegram_user_id: user.id,
          p_admin_id: adminId,
          p_stake_amount: stakeAmount,
        });

        if (buyErr || !buyRes?.success) {
          const errMsg = buyRes?.error || buyErr?.message || "Failed to purchase lotto tokens";
          await answerCallbackQuery(botToken, callbackQuery.id, `⚠️ ${errMsg}`, true);
        } else {
          await answerCallbackQuery(botToken, callbackQuery.id, `🎉 ${buyRes.tokens_bought} እጣዎች በተሳካ ሁኔታ ተገዝተዋል!`, true);
          await sendTelegramMessage(
            botToken,
            chatId,
            `🎟️ <b>የዕለታዊ ሎቶ እጣዎች ተረጋግጠዋል!</b>\n\n` +
            `• የተገዙ እጣዎች: <b>${buyRes.tokens_bought}</b> (${buyRes.stake_amount} ETB)\n` +
            `• የእጣ ቁጥሮችዎ: <b>${buyRes.ticket_numbers.map((n: number) => `#${n}`).join(", ")}</b>\n` +
            `• ዙር: <b>#${buyRes.round_number}</b>\n` +
            `• የዕጣ ማውጫ ሰዓት: <b>ማታ 12 ሰአት (6:00 PM)</b>\n\n` +
            `መልካም እድል! እጣው ዛሬ ማታ 12 ሰአት ይወጣል።`
          );
        }
      }

      // 3. Pick Room -> Show Admin Picker
      if (chatId && data.startsWith("pick_room:")) {
        handled = true;
        const roomSlug = data.replace("pick_room:", "");
        const rooms = await getBingoRooms(supabaseClient);
        const room = rooms.find((r: any) => r.slug === roomSlug || r.id === roomSlug) || rooms[1];
        const admins = await getActiveAdmins(supabaseClient);

        await sendTelegramMessage(
          botToken,
          chatId,
          `🎲 Selected: <b>${room.name}</b> (Card Stake: ${room.stake_amount} ETB)\n\n` +
          `👤 <b>Select your Admin / Agent:</b>\n` +
          `Admins manage your game credits, deposits, and win payouts.\n` +
          `Choose which admin you want to play through:`,
          buildAdminsKeyboard(admins, room.slug || room.id)
        );
        await answerCallbackQuery(botToken, callbackQuery.id);
      }

      // 4. Pick Admin -> Check User Balance with that Admin & Launch WebApp
      if (chatId && data.startsWith("pick_admin:")) {
        handled = true;
        const parts = data.replace("pick_admin:", "").split(":");
        const roomSlug = parts[0];
        const adminIdentifier = parts[1];

        const { data: admin } = await supabaseClient
          .from("admins")
          .select("*")
          .or(`id.eq.${adminIdentifier},slug.eq.${adminIdentifier}`)
          .maybeSingle();

        const rooms = await getBingoRooms(supabaseClient);
        const room = rooms.find((r: any) => r.slug === roomSlug || r.id === roomSlug) || rooms[1];

        // Check user wallet under this specific admin
        let userBalance = 0;
        let depositedBal = 0;
        let wonBal = 0;

        if (admin) {
          const { data: wallet } = await supabaseClient
            .from("admin_user_wallets")
            .select("deposited_balance, won_balance")
            .eq("telegram_user_id", user.id)
            .eq("admin_id", admin.id)
            .maybeSingle();

          if (wallet) {
            depositedBal = wallet.deposited_balance || 0;
            wonBal = wallet.won_balance || 0;
            userBalance = depositedBal + wonBal;
          } else {
            // Check legacy balance fallback if first time
            const { data: legacyUser } = await supabaseClient
              .from("telegram_users")
              .select("balance, deposited_balance, won_balance")
              .eq("telegram_user_id", user.id)
              .maybeSingle();

            if (legacyUser && admin.slug === "parcelic") {
              userBalance = legacyUser.balance || 0;
              depositedBal = legacyUser.deposited_balance || 0;
              wonBal = legacyUser.won_balance || 0;
            }
          }
        }

        const minRequired = room.min_balance || room.stake_amount || 10;
        const adminUsername = admin?.telegram_username ? admin.telegram_username.replace(/^@/, "") : "parcelic";
        const adminLink = `https://t.me/${adminUsername}`;

        if (userBalance < minRequired) {
          // Insufficient balance with this admin
          await answerCallbackQuery(
            botToken,
            callbackQuery.id,
            `⚠️ Insufficient credit with Admin ${admin?.display_name || 'Selected Admin'}!\nRequired: ${minRequired} ETB | Balance: ${userBalance} ETB`,
            true
          );

          await sendTelegramMessage(
            botToken,
            chatId,
            `⚠️ <b>Top-Up Required for ${room.name}</b>\n\n` +
            `• Admin: <b>${admin?.display_name || 'Admin'}</b> (@${adminUsername})\n` +
            `• Required Stake: <b>${minRequired} ETB</b>\n` +
            `• Your Balance with this Admin: <b>${userBalance} ETB</b>\n\n` +
            `To start playing, please message the Admin directly to top up your balance:`,
            {
              inline_keyboard: [
                [{ text: `💬 Top Up via @${adminUsername}`, url: adminLink }],
                [{ text: "🔄 Choose Another Admin", callback_data: `pick_room:${room.slug || room.id}` }],
                [{ text: "🔄 Change Room", callback_data: "choose_game:bingo" }],
              ],
            }
          );
        } else {
          // Sufficient balance: launch live game session
          const gameUrl = `${appUrl}${appUrl.includes("?") ? "&" : "?"}game=bingo&room=${room.slug || room.id}&admin=${admin?.id || adminIdentifier}`;

          await sendTelegramMessage(
            botToken,
            chatId,
            `✅ <b>Ready to Play in ${room.name}!</b>\n\n` +
            `• Admin: <b>${admin?.display_name || 'Admin'}</b> (@${adminUsername})\n` +
            `• Card Stake: <b>${room.stake_amount} ETB</b>\n` +
            `• Your Balance: <b>${userBalance} ETB</b>\n\n` +
            `🚀 Tap the button below to join the live shared session:`,
            {
              inline_keyboard: [
                [
                  {
                    text: `🎮 Join ${room.name}`,
                    web_app: { url: gameUrl },
                  },
                ],
                [
                  { text: "🔄 Switch Admin", callback_data: `pick_room:${room.slug || room.id}` },
                  { text: "🔄 Change Room", callback_data: "choose_game:bingo" },
                ],
              ],
            }
          );
          await answerCallbackQuery(botToken, callbackQuery.id);
        }
      }

      // 5. Check Balance Across Admins
      if (chatId && data === "check_balance") {
        handled = true;
        const { data: wallets } = await supabaseClient
          .from("admin_user_wallets")
          .select("deposited_balance, won_balance, admins(display_name, telegram_username)")
          .eq("telegram_user_id", user.id);

        let balanceText = `💰 <b>Your Balances by Admin:</b>\n\n`;

        if (wallets && wallets.length > 0) {
          let grandTotal = 0;
          for (const w of wallets) {
            const adminName = (w.admins as any)?.display_name || "Admin";
            const total = (w.deposited_balance || 0) + (w.won_balance || 0);
            grandTotal += total;
            balanceText += `👤 <b>${adminName}</b>:\n`;
            balanceText += `   • Total: <b>${total} ETB</b> (Deposited: ${w.deposited_balance || 0}, Won: ${w.won_balance || 0})\n\n`;
          }
          balanceText += `💵 <b>Grand Total Across Admins:</b> <b>${grandTotal} ETB</b>`;
        } else {
          const { data: legacyUser } = await supabaseClient
            .from("telegram_users")
            .select("balance, deposited_balance, won_balance")
            .eq("telegram_user_id", user.id)
            .maybeSingle();

          const bal = legacyUser?.balance || 0;
          balanceText += `🎮 Total Balance: <b>${bal} ETB</b>\n`;
          balanceText += `• Deposited: ${legacyUser?.deposited_balance || 0} ETB\n`;
          balanceText += `• Won: ${legacyUser?.won_balance || 0} ETB\n`;
        }

        balanceText += `\n\nPick a room to start playing:`;

        await sendTelegramMessage(botToken, chatId, balanceText, {
          inline_keyboard: [
            [{ text: "🎯 Play Bingo", callback_data: "choose_game:bingo" }],
            [{ text: "🔙 Games Menu", callback_data: "back_to_games" }],
          ],
        });
        await answerCallbackQuery(botToken, callbackQuery.id);
      }

      // 6. Referral Invite
      if (chatId && data === "show_invite") {
        handled = true;
        const { data: existingUser } = await supabaseClient
          .from("telegram_users")
          .select("referral_code, total_referrals")
          .eq("telegram_user_id", user.id)
          .maybeSingle();

        const botUsername = Deno.env.get("TELEGRAM_BOT_USERNAME") || "yeAddisGamesbot";
        const inviteLink = `https://t.me/${botUsername}?start=${existingUser?.referral_code || user.id}`;

        await sendTelegramMessage(
          botToken,
          chatId,
          `🎁 <b>Invite Friends & Earn! / ጓደኞችዎን ይጋብዙና ተሸላሚ ይሁኑ!</b>\n\n` +
          `💰 Get <b>10 ETB</b> deposited to your balance for every friend who joins!\n` +
          `🎁 Your friend also gets <b>10 ETB</b> welcome bonus!\n\n` +
          `🔗 <b>Your Unique Referral Link:</b>\n<code>${inviteLink}</code>\n\n` +
          `📤 Share this link with your friends and start playing together!`,
          {
            inline_keyboard: [
              [{ text: "🎯 Play Bingo", callback_data: "choose_game:bingo" }],
              [{ text: "🔙 Back to Games", callback_data: "back_to_games" }],
            ],
          }
        );
        await answerCallbackQuery(botToken, callbackQuery.id);
      }

      if (!handled) {
        await answerCallbackQuery(botToken, callbackQuery.id);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // Handle Text Messages & Slash Commands
    // ==========================================
    if (!update.message || !update.message.text) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = update.message;
    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const user = message.from;

    // Command: /start or /register
    if (text.startsWith("/start") || text.startsWith("/register")) {
      const referralCode = text.startsWith("/start ") ? text.split(" ")[1] : null;

      const { data: existingUser } = await supabaseClient
        .from("telegram_users")
        .select("*")
        .eq("telegram_user_id", user.id)
        .maybeSingle();

      let isNewUser = false;
      let referralBonus = 0;

      if (!existingUser) {
        const { error } = await supabaseClient
          .from("telegram_users")
          .insert({
            telegram_user_id: user.id,
            telegram_username: user.username,
            telegram_first_name: user.first_name,
            telegram_last_name: user.last_name,
            balance: 10,
            deposited_balance: 10,
            last_active_at: new Date().toISOString(),
          });

        if (!error) {
          isNewUser = true;
          // Seed wallet under default admin
          const { data: defAdmin } = await supabaseClient
            .from("admins")
            .select("id")
            .eq("slug", "parcelic")
            .maybeSingle();

          if (defAdmin) {
            await supabaseClient.from("admin_user_wallets").insert({
              telegram_user_id: user.id,
              admin_id: defAdmin.id,
              deposited_balance: 10,
              won_balance: 0,
            });
          }

          if (referralCode) {
            try {
              const { data: bonusResult } = await supabaseClient.rpc("handle_referral_bonus", {
                new_user_telegram_id: user.id,
                referrer_code: referralCode,
              });
              if (bonusResult?.success) {
                referralBonus = bonusResult.new_user_bonus || 0;
              }
            } catch {
              // Ignore referral bonus error
            }
          }
        }
      } else {
        await supabaseClient
          .from("telegram_users")
          .update({ last_active_at: new Date().toISOString() })
          .eq("telegram_user_id", user.id);
      }

      let welcomeMsg = `እንኳን ወደ የአዲስ ጌምስ በደህና መጡ፣ <b>${user.first_name}</b>!\n\n`;
      if (isNewUser) {
        welcomeMsg = `🎉 እንኳን ወደ የአዲስ ጌምስ በደህና መጡ፣ <b>${user.first_name}</b>!\n💰 <b>10 ETB የእንኳን ደህና መጡ ቦነስ</b> ወደ ሂሳብዎ ተጨምሯል።\n\n`;
      }

      welcomeMsg += `🎮 <b>ጨዋታ ይምረጡ:</b>`;
      const games = await getGamesCatalog(supabaseClient);

      await sendTelegramMessage(botToken, chatId, welcomeMsg, buildGamesKeyboard(games, appUrl));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Command: /play or /bingo -> Go straight to Bingo Rooms
    if (text.startsWith("/play") || text.startsWith("/bingo")) {
      const rooms = await getBingoRooms(supabaseClient);
      await sendTelegramMessage(
        botToken,
        chatId,
        `🎯 <b>የአዲስ ቢንጎ የቀጥታ ክፍሎች</b>\n\n` +
        `• 5 የቀጥታ የቢንጎ ክፍሎች እስከ 400 ተጫዋቾች!\n` +
        `• የሚፈልጉትን ክፍል ይምረጡ:`,
        buildRoomsKeyboard(rooms)
      );
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Command: /rooms or /sections
    if (text.startsWith("/rooms") || text.startsWith("/sections")) {
      const rooms = await getBingoRooms(supabaseClient);
      await sendTelegramMessage(
        botToken,
        chatId,
        `🎲 <b>የቢንጎ ክፍሎች:</b>`,
        buildRoomsKeyboard(rooms)
      );
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Command: /balance
    if (text.startsWith("/balance")) {
      const { data: wallets } = await supabaseClient
        .from("admin_user_wallets")
        .select("deposited_balance, won_balance, admins(display_name, telegram_username)")
        .eq("telegram_user_id", user.id);

      let balanceText = `💰 <b>የሂሳብ መግለጫ (Balances by Admin):</b>\n\n`;

      if (wallets && wallets.length > 0) {
        let grandTotal = 0;
        for (const w of wallets) {
          const adminName = (w.admins as any)?.display_name || "Admin";
          const total = (w.deposited_balance || 0) + (w.won_balance || 0);
          grandTotal += total;
          balanceText += `👤 <b>${adminName}</b>:\n`;
          balanceText += `   • ጠቅላላ: <b>${total} ETB</b> (የተቀመጠ: ${w.deposited_balance || 0}, ያሸነፉት: ${w.won_balance || 0})\n\n`;
        }
        balanceText += `💵 <b>ጠቅላላ ሂሳብ:</b> <b>${grandTotal} ETB</b>`;
      } else {
        const { data: legacyUser } = await supabaseClient
          .from("telegram_users")
          .select("balance, deposited_balance, won_balance")
          .eq("telegram_user_id", user.id)
          .maybeSingle();

        balanceText += `🎮 ጠቅላላ ሂሳብ: <b>${legacyUser?.balance || 0} ETB</b>\n`;
        balanceText += `• የተቀመጠ: ${legacyUser?.deposited_balance || 0} ETB\n`;
        balanceText += `• ያሸነፉት: ${legacyUser?.won_balance || 0} ETB\n`;
      }

      await sendTelegramMessage(botToken, chatId, balanceText, {
        inline_keyboard: [
          [{ text: "🎯 ቢንጎ ይጫወቱ", callback_data: "choose_game:bingo" }],
          [{ text: "🔙 ወደ ዋና ማውጫ", callback_data: "back_to_games" }],
        ],
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default Fallback
    await sendTelegramMessage(
      botToken,
      chatId,
      `እንኳን ወደ የአዲስ ጌምስ በደህና መጡ!\n\nጨዋታ ለመጀመር ወይም ሂሳብዎን ለመመልከት ከታች ያለውን ይክፈቱ።`,
      {
        inline_keyboard: [
          [{ text: "🎮 ጨዋታውን ይክፈቱ", web_app: { url: appUrl } }],
          [{ text: "🔙 ዋና ማውጫ", callback_data: "back_to_games" }]
        ]
      }
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});