// Compo.io — toute la logique de classement.
// Les tables sont fermées au navigateur : cette fonction est le seul chemin d'écriture.
// La clé secrète est fournie par Supabase à l'exécution, elle n'est jamais dans le dépôt.
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY")!,
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Le jour de référence est celui de Paris, calculé ici : le navigateur ne décide pas.
const EPOCH = Date.UTC(2026, 10, 6, 12);
function jour(): number {
  const [y, m, d] = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d, 12) - EPOCH) / 864e5) + 1;
}

// Le bonus de rapidite est proportionnel au temps accorde, pas au nombre de
// secondes restantes : sinon le rugby (270 s) plafonnerait 180 points au-dessus
// du foot (180 s) pour la meme performance. Meme maximum des deux cotes : 1360.
const BONUS_MAX = 360;
const points = (trouves: number, taille: number, restant: number, indices: number, duree: number) =>
  Math.max(0, Math.round(1000 * trouves / taille)
    + (trouves === taille && duree > 0 ? Math.round(BONUS_MAX * restant / duree) : 0)
    - 50 * indices);

const uuid = (s: unknown) =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// Une compo du jour par sport : le sport fait partie de la cle du classement.
const SPORTS = new Set(["foot", "rugby"]);
const sportDe = (s: unknown) => (typeof s === "string" && SPORTS.has(s) ? s : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let c: Record<string, any>;
  try { c = await req.json(); } catch { return json({ code: "corps", erreur: "corps illisible" }, 400); }
  const aujourdhui = jour();

  try {
    // ---- ouverture de partie : c'est ici que démarre l'horloge qui fait foi
    if (c.action === "start") {
      if (!uuid(c.playerId)) return json({ code: "id", erreur: "identifiant invalide" }, 400);
      const pseudo = String(c.pseudo ?? "").trim();
      if (pseudo.length < 2 || pseudo.length > 20) return json({ code: "pseudo", erreur: "pseudo entre 2 et 20 caracteres" }, 400);
      const taille = Number(c.size), duree = Number(c.duration);
      if (!(taille >= 1 && taille <= 30) || !(duree >= 30 && duree <= 1800)) return json({ code: "partie", erreur: "partie invalide" }, 400);
      const sport = sportDe(c.sport);
      if (!sport) return json({ code: "sport", erreur: "sport invalide" }, 400);

      await db.from("players").upsert({ id: c.playerId, pseudo, last_seen: new Date().toISOString() });

      const code = String(c.groupCode ?? "").trim().toLowerCase();
      if (code) {
        if (!/^[a-z0-9-]{3,24}$/.test(code)) return json({ code: "groupe", erreur: "code de groupe invalide" }, 400);
        await db.from("groups").upsert({ code }, { onConflict: "code", ignoreDuplicates: true });
        await db.from("memberships").upsert({ group_code: code, player_id: c.playerId });
      }

      const { data: deja } = await db.from("scores").select("day")
        .eq("player_id", c.playerId).eq("day", aujourdhui).eq("sport", sport).maybeSingle();
      // Le sport est renvoye avec le refus : c'est ce qui permet a l'app de
      // distinguer cette reponse de celle d'une ancienne version de la fonction,
      // qui ne comptait qu'une partie par jour tous sports confondus.
      if (deja) return json({ code: "deja_joue", erreur: "deja joue aujourd'hui", day: aujourdhui, sport }, 409);

      const { data, error } = await db.from("rounds")
        .insert({ player_id: c.playerId, day: aujourdhui, sport, size: taille, duration: duree })
        .select("id").single();
      if (error) throw error;
      return json({ roundId: data.id, day: aujourdhui, sport });
    }

    // ---- fin de partie : le score est recalculé ici, le navigateur ne l'envoie pas
    if (c.action === "submit") {
      if (!uuid(c.roundId)) return json({ code: "inconnue", erreur: "partie inconnue" }, 400);
      const { data: r } = await db.from("rounds").select("*").eq("id", c.roundId).maybeSingle();
      if (!r) return json({ code: "inconnue", erreur: "partie inconnue" }, 404);
      if (r.submitted) return json({ code: "close", erreur: "partie deja close" }, 409);
      if (r.day !== aujourdhui) return json({ code: "perimee", erreur: "partie perimee" }, 409);

      const trouves = Math.max(0, Math.min(Number(c.found) || 0, r.size));
      const indices = Math.max(0, Math.min(Number(c.hints) || 0, r.size));
      const ecoule = Math.floor((Date.now() - Date.parse(r.started_at)) / 1000);

      // Un humain ne tape pas douze noms en deux secondes. Ce n'est pas une preuve,
      // mais ça ferme l'attaque la plus simple : ouvrir une partie et la rendre
      // aussitôt en annonçant tout trouvé. La partie reste ouverte, donc un joueur
      // honnête qui va très vite n'a qu'à renvoyer une seconde plus tard.
      const plancher = trouves;                                  // 1 seconde par réponse
      if (ecoule < plancher) return json({ code: "trop_rapide", erreur: "partie trop rapide", minimum: plancher }, 409);

      const restant = Math.max(0, r.duration - ecoule);          // horloge serveur
      const pts = points(trouves, r.size, restant, indices, r.duration);

      await db.from("rounds").update({ submitted: true }).eq("id", r.id);
      const { error } = await db.from("scores").insert({
        player_id: r.player_id, day: r.day, sport: r.sport, found: trouves, size: r.size,
        hints: indices, time_left: restant, seconds: Math.min(ecoule, r.duration), points: pts,
      });
      if (error && error.code !== "23505") throw error;           // 23505 = déjà classé

      return json({ day: r.day, sport: r.sport, found: trouves, size: r.size, hints: indices, timeLeft: restant, points: pts });
    }

    // ---- classement du jour dans un groupe, et série du joueur
    if (c.action === "board") {
      // Sans code de groupe, le classement est global : c'est le cas normal
      // depuis que l'app ne demande plus de groupe. Le filtre par groupe reste
      // la, inutilise, pour qu'un classement entre amis se rebranche sans
      // retoucher le serveur.
      const code = String(c.groupCode ?? "").trim().toLowerCase();
      if (code && !/^[a-z0-9-]{3,24}$/.test(code)) return json({ code: "groupe", erreur: "code de groupe invalide" }, 400);
      const sport = sportDe(c.sport);
      if (!sport) return json({ code: "sport", erreur: "sport invalide" }, 400);
      const j = Number.isInteger(c.day) ? c.day : aujourdhui;

      let ids: string[] | null = null;
      if (code) {
        const { data: membres } = await db.from("memberships").select("player_id").eq("group_code", code);
        ids = (membres ?? []).map((m: any) => m.player_id);
        if (!ids.length) return json({ day: j, sport, classement: [] });
      }

      // Un classement par sport : ne jouer que le rugby ne fait pas descendre.
      let q = db.from("scores")
        .select("player_id, points, found, size, seconds, hints, players(pseudo)")
        .eq("day", j).eq("sport", sport);
      if (ids) q = q.in("player_id", ids);
      const { data: lignes } = await q
        .order("points", { ascending: false }).order("seconds", { ascending: true })
        .limit(100);

      let serie = 0;
      if (uuid(c.playerId)) {
        const { data: jours } = await db.from("scores").select("day")
          .eq("player_id", c.playerId).eq("sport", sport).lte("day", aujourdhui)
          .order("day", { ascending: false }).limit(400);
        for (const [i, l] of (jours ?? []).entries()) { if (l.day === aujourdhui - i) serie++; else break; }
      }

      return json({
        day: j, sport, serie,
        classement: (lignes ?? []).map((l: any, i: number) => ({
          rang: i + 1, playerId: l.player_id, pseudo: l.players?.pseudo ?? "?",
          points: l.points, found: l.found, size: l.size, seconds: l.seconds, hints: l.hints,
        })),
      });
    }

    // ---- tableau de bord, réservé au propriétaire
    // La porte est ici, pas dans le navigateur : le code de reprise de
    // l'administrateur est posé en secret Supabase (ADMIN_PLAYER_ID), et c'est
    // le serveur qui compare. Tant que ce secret n'existe pas, l'action est
    // fermée à tout le monde, y compris à celui qui devinerait son nom.
    if (c.action === "stats") {
      const admin = (Deno.env.get("ADMIN_PLAYER_ID") ?? "").trim().toLowerCase();
      if (!admin || !uuid(c.playerId) || String(c.playerId).toLowerCase() !== admin)
        return json({ code: "refuse", erreur: "reserve" }, 403);

      const JOURS = 30;
      const depuis = Math.max(1, aujourdhui - JOURS + 1);
      const { data: lignes } = await db.from("scores")
        .select("player_id, day, sport, found, size, hints, seconds")
        .gte("day", depuis).limit(50000);
      const { count: joueurs } = await db.from("players")
        .select("id", { count: "exact", head: true });
      const { count: parties } = await db.from("scores")
        .select("player_id", { count: "exact", head: true });

      // On agrège ici plutôt qu'en SQL : la base est petite, et ça évite une
      // vue à maintenir en parallèle du reste.
      const vide = () => ({ n: 0, complets: 0, indices: 0, secondes: 0, trouves: 0, total: 0 });
      const sports: Record<string, ReturnType<typeof vide>> = { foot: vide(), rugby: vide() };
      const parJour = new Map<number, Record<string, number>>();
      const joursParJoueur = new Map<string, Set<number>>();

      for (const l of lignes ?? []) {
        const s = sports[l.sport]; if (!s) continue;
        s.n++; s.indices += l.hints; s.secondes += l.seconds;
        s.trouves += l.found; s.total += l.size;
        if (l.found === l.size) s.complets++;
        const d = parJour.get(l.day) ?? { foot: 0, rugby: 0, joueurs: 0 };
        d[l.sport]++; parJour.set(l.day, d);
        const vus = joursParJoueur.get(l.player_id) ?? new Set<number>();
        vus.add(l.day); joursParJoueur.set(l.player_id, vus);
      }
      // Joueurs distincts par jour : un même joueur qui fait les deux sports
      // ne compte qu'une fois.
      const parJourJoueurs = new Map<number, Set<string>>();
      for (const l of lignes ?? []) {
        const s = parJourJoueurs.get(l.day) ?? new Set<string>();
        s.add(l.player_id); parJourJoueurs.set(l.day, s);
      }
      for (const [j, s] of parJourJoueurs) {
        const d = parJour.get(j); if (d) d.joueurs = s.size;
      }

      let fideles = 0;
      for (const vus of joursParJoueur.values()) if (vus.size >= 3) fideles++;

      const jours = [...parJour.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([day, d]) => ({ day, foot: d.foot, rugby: d.rugby, joueurs: d.joueurs }));

      return json({ jour: aujourdhui, joueurs, parties, fideles, jours, sports });
    }

    return json({ code: "action", erreur: "action inconnue" }, 400);
  } catch (e) {
    console.error(e);
    return json({ code: "serveur", erreur: "erreur serveur" }, 500);
  }
});
