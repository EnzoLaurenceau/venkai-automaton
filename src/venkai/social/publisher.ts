/**
 * Venkai Social Publisher — the automaton markets its own work (Conway playbook:
 * self-promotion is part of "honest work others voluntarily pay for").
 * X (OAuth 1.0a), Instagram Graph, TikTok Content Posting, Product Hunt GraphQL.
 * Keys from env only, all network calls injectable for tests.
 */

import crypto from "node:crypto";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface Publisher {
  name: string;
  publish(content: PublishContent): Promise<{ id: string; url?: string }>;
}

export interface PublishContent {
  text: string;
  link?: string;
  imageUrl?: string;
}

// ─── X / Twitter (OAuth 1.0a user context, write-only needs no paid tier) ─────

function oauth1Header(method: string, url: string, keys: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string }): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params: Record<string, string> = {
    oauth_consumer_key: keys.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: keys.accessToken,
    oauth_version: "1.0",
  };
  const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const paramStr = Object.keys(params).sort().map((k) => `${encode(k)}=${encode(params[k])}`).join("&");
  const baseString = `${method.toUpperCase()}&${encode(url)}&${encode(paramStr)}`;
  const signingKey = `${encode(keys.apiSecret)}&${encode(keys.accessSecret)}`;
  params.oauth_signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
  return "OAuth " + Object.keys(params).sort().map((k) => `${encode(k)}="${encode(params[k])}"`).join(", ");
}

export function createXPublisher(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>, fetcher: Fetcher = fetch): Publisher | null {
  const keys = {
    apiKey: env.X_API_KEY || env.TWITTER_API_KEY || "",
    apiSecret: env.X_API_SECRET || env.TWITTER_API_SECRET || "",
    accessToken: env.X_ACCESS_TOKEN || env.TWITTER_ACCESS_TOKEN || "",
    accessSecret: env.X_ACCESS_SECRET || env.TWITTER_ACCESS_SECRET || "",
  };
  if (!keys.apiKey || !keys.accessToken) return null;
  return {
    name: "x",
    async publish(content) {
      const res = await fetcher("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: { Authorization: oauth1Header("POST", "https://api.twitter.com/2/tweets", keys), "Content-Type": "application/json" },
        body: JSON.stringify({ text: content.link ? `${content.text}\n\n${content.link}` : content.text }),
      });
      const json = (await res.json()) as { data?: { id?: string } };
      if (!res.ok || !json.data?.id) throw new Error(`x publish failed: ${JSON.stringify(json).slice(0, 200)}`);
      return { id: String(json.data.id), url: `https://x.com/i/status/${json.data.id}` };
    },
  };
}

// ─── Instagram Graph (business account, long-lived token) ─────────────────────

export function createInstagramPublisher(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>, fetcher: Fetcher = fetch): Publisher | null {
  const token = env.INSTAGRAM_TOKEN;
  const igUserId = env.INSTAGRAM_BUSINESS_ID;
  if (!token || !igUserId) return null;
  return {
    name: "instagram",
    async publish(content) {
      const create = await fetcher(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: content.imageUrl, caption: content.text, access_token: token }),
      });
      const created = (await create.json()) as { id?: string };
      if (!create.ok || !created.id) throw new Error(`ig media failed: ${JSON.stringify(created).slice(0, 200)}`);
      const pub = await fetcher(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: created.id, access_token: token }),
      });
      const published = (await pub.json()) as { id?: string };
      return { id: String(published.id ?? created.id) };
    },
  };
}

// ─── TikTok Content Posting API ───────────────────────────────────────────────

export function createTikTokPublisher(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>, fetcher: Fetcher = fetch): Publisher | null {
  const token = env.TIKTOK_ACCESS_TOKEN;
  if (!token) return null;
  return {
    name: "tiktok",
    async publish(content) {
      const res = await fetcher("https://open.tiktokapis.com/v2/post/publish/video/init/", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ post_info: { title: content.text, privacy_level: "PUBLIC_TO_EVERYONE" }, source_info: { source: "PULL_FROM_URL", video_url: content.link } }),
      });
      const json = (await res.json()) as { data?: { publish_id?: string } };
      return { id: String(json.data?.publish_id ?? "queued") };
    },
  };
}

// ─── Product Hunt GraphQL API (submit a product) ──────────────────────────────

export function createProductHuntPublisher(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>, fetcher: Fetcher = fetch): Publisher | null {
  const token = env.PRODUCTHUNT_TOKEN;
  if (!token) return null;
  return {
    name: "producthunt",
    async publish(content) {
      const mutation = `mutation create($name: String!, $tagline: String!, $url: String!, $description: String, $topicIds: [ID!]) {
        createPost(input: { name: $name, tagline: $tagline, url: $url, description: $description, topicIds: $topicIds }) {
          post { id url }
        }
      }`;
      const res = await fetcher("https://api.producthunt.com/v2/api/graphql", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query: mutation,
          variables: { name: content.text.split("\n")[0].slice(0, 60), tagline: content.text.split("\n")[0].slice(0, 80), url: content.link ?? "https://venkai.fr", description: content.text, topicIds: [] },
        }),
      });
      const json = (await res.json()) as { data?: { createPost?: { post?: { id?: string; url?: string } } } };
      const post = json.data?.createPost?.post;
      return { id: String(post?.id ?? "created"), url: post?.url };
    },
  };
}

/** All configured publishers (null ones are skipped: missing env keys). */
export function createPublishers(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>, fetcher: Fetcher = fetch): Publisher[] {
  return [createXPublisher(env, fetcher), createInstagramPublisher(env, fetcher), createTikTokPublisher(env, fetcher), createProductHuntPublisher(env, fetcher)].filter((p): p is Publisher => p !== null);
}
