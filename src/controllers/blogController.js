const supabase = require("../services/supabaseClient");

const BLOG_TABLE = "storefront_blog_posts";
const starter = { slug: "how-fast-data-bundles-keep-you-connected", title: "How fast data bundles keep Ghana connected", excerpt: "A simple guide to choosing the right bundle and getting back online quickly.", content: "Staying connected should be simple. Choose your network, select the bundle that fits your day, and keep your phone ready for the delivery update.\n\nNimpatech makes the process clear from checkout to delivery, with secure payments and live support when you need it.", published: true };

function slugify(value) { return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || `post-${Date.now()}`; }
function cleanPost(body) { return { slug: slugify(body.slug || body.title), title: String(body.title || "").trim().slice(0, 140), excerpt: String(body.excerpt || "").trim().slice(0, 280), content: String(body.content || "").trim().slice(0, 12000), published: body.published !== false }; }

async function ensureStarter(admin) {
  await admin.from(BLOG_TABLE).upsert({ ...starter, published_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "slug", ignoreDuplicates: true });
}

async function listPublished(_req, res) {
  try {
    const admin = supabase.getAdminClient();
    await ensureStarter(admin);
    const { data, error } = await admin.from(BLOG_TABLE).select("id, slug, title, excerpt, content, published_at, created_at, updated_at").eq("published", true).order("published_at", { ascending: false });
    if (error) throw error;
    return res.json({ posts: data || [] });
  } catch (error) {
    console.error("Public blog listing failed:", error.message);
    return res.status(503).json({ error: "Blog posts are not configured yet." });
  }
}

async function listAdmin(_req, res) { const { data, error } = await supabase.getAdminClient().from(BLOG_TABLE).select("*").order("created_at", { ascending: false }); if (error) return res.status(503).json({ error: "Could not load blog posts." }); return res.json({ posts: data || [] }); }
async function create(req, res) { const post = cleanPost(req.body); if (!post.title || !post.content) return res.status(400).json({ error: "Title and content are required." }); const { data, error } = await supabase.getAdminClient().from(BLOG_TABLE).insert({ ...post, published_at: post.published ? new Date().toISOString() : null }).select().single(); if (error) return res.status(503).json({ error: "Could not create blog post." }); return res.status(201).json(data); }
async function update(req, res) { const post = cleanPost(req.body); if (!post.title || !post.content) return res.status(400).json({ error: "Title and content are required." }); const { data, error } = await supabase.getAdminClient().from(BLOG_TABLE).update({ ...post, published_at: post.published ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", req.params.id).select().single(); if (error) return res.status(503).json({ error: "Could not update blog post." }); return res.json(data); }
async function remove(req, res) { const { error } = await supabase.getAdminClient().from(BLOG_TABLE).delete().eq("id", req.params.id); if (error) return res.status(503).json({ error: "Could not delete blog post." }); return res.status(204).end(); }

module.exports = { listPublished, listAdmin, create, update, remove };
