import { createFileRoute } from "@tanstack/react-router";

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

const MAX_BYTES = 25 * 1024 * 1024;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/upload")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return Response.json({ error: "No file provided." }, { status: 400, headers: cors });
          }
          const ext = ALLOWED[file.type];
          if (!ext) {
            return Response.json(
              { error: "Unsupported file type. Use PNG, JPG, GIF, WEBP, AVIF, BMP or SVG." },
              { status: 415, headers: cors },
            );
          }
          if (file.size > MAX_BYTES) {
            return Response.json({ error: "File is larger than 25 MB." }, { status: 413, headers: cors });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
          const key = `${id}.${ext}`;

          const { error } = await supabaseAdmin.storage
            .from("uploads")
            .upload(key, await file.arrayBuffer(), {
              contentType: file.type,
              cacheControl: "31536000",
              upsert: false,
            });
          if (error) {
            return Response.json({ error: error.message }, { status: 500, headers: cors });
          }

          const origin = new URL(request.url).origin;
          return Response.json(
            { url: `${origin}/api/public/i/${key}`, key, size: file.size, type: file.type },
            { headers: cors },
          );
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "Upload failed." },
            { status: 500, headers: cors },
          );
        }
      },
    },
  },
});
