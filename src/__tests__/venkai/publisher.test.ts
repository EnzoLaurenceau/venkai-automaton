import { describe, it, expect } from "vitest";
import { createXPublisher, createInstagramPublisher, createTikTokPublisher, createProductHuntPublisher, createPublishers } from "../../venkai/social/publisher.js";

const ENV = {
  X_API_KEY: "ck",
  X_API_SECRET: "cs",
  X_ACCESS_TOKEN: "at",
  X_ACCESS_SECRET: "as",
  INSTAGRAM_TOKEN: "ig",
  INSTAGRAM_BUSINESS_ID: "123",
  TIKTOK_ACCESS_TOKEN: "tt",
  PRODUCTHUNT_TOKEN: "ph",
};

describe("social publisher", () => {
  it("x publisher signs with oauth1 and posts", async () => {
    let authHeader = "";
    let body = "";
    const fakeFetch = async (url: string | URL, init?: RequestInit) => {
      authHeader = String((init?.headers as Record<string, string>)?.Authorization ?? "");
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ data: { id: "999" } }), { status: 201 });
    };
    const x = createXPublisher(ENV, fakeFetch as never);
    expect(x).not.toBeNull();
    const result = await x!.publish({ text: "hello world", link: "https://buy.stripe.com/x" });
    expect(result.id).toBe("999");
    expect(authHeader).toMatch(/^OAuth /);
    expect(authHeader).toContain('oauth_consumer_key="ck"');
    expect(authHeader).toContain('oauth_signature="');
    expect(JSON.parse(body).text).toContain("https://buy.stripe.com/x");
  });

  it("publishers are null without keys", () => {
    expect(createXPublisher({}, async () => new Response("{}"))).toBeNull();
    expect(createInstagramPublisher({}, async () => new Response("{}"))).toBeNull();
    expect(createProductHuntPublisher({}, async () => new Response("{}"))).toBeNull();
    expect(createPublishers({}, async () => new Response("{}"))).toHaveLength(0);
  });

  it("instagram two-step publish", async () => {
    const calls: string[] = [];
    const fakeFetch = async (url: string | URL) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ id: calls.length === 1 ? "container1" : "media1" }), { status: 200 });
    };
    const ig = createInstagramPublisher(ENV, fakeFetch as never);
    const r = await ig!.publish({ text: "post", imageUrl: "https://venkai.fr/img.png" });
    expect(r.id).toBe("media1");
    expect(calls.some((c) => c.includes("/media"))).toBe(true);
    expect(calls.some((c) => c.includes("/media_publish"))).toBe(true);
  });

  it("producthunt graphql submit", async () => {
    let sentQuery = "";
    const fakeFetch = async (_url: string | URL, init?: RequestInit) => {
      sentQuery = String(init?.body ?? "");
      return new Response(JSON.stringify({ data: { createPost: { post: { id: "p1", url: "https://www.producthunt.com/posts/venkai-automaton" } } } }), { status: 200 });
    };
    const ph = createProductHuntPublisher(ENV, fakeFetch as never);
    const r = await ph!.publish({ text: "Venkai Automaton\nAgent autonome", link: "https://venkai.fr" });
    expect(r.url).toContain("producthunt.com");
    expect(sentQuery).toContain("createPost");
  });

  it("tiktok init publish", async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ data: { publish_id: "tt1" } }), { status: 200 });
    const tt = createTikTokPublisher(ENV, fakeFetch as never);
    const r = await tt!.publish({ text: "demo", link: "https://venkai.fr/demo.mp4" });
    expect(r.id).toBe("tt1");
    expect(createPublishers(ENV, fakeFetch as never)).toHaveLength(4);
  });
});
