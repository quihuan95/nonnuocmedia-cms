/**
 * project-category controller
 */

import { factories } from '@strapi/strapi'
import fs from "fs/promises";
import slugify from "slugify";

interface PostImportItem {
  id?: number;
  name?: string;
  parent_id?: number;
  description?: string;
  status?: string;
  order?: number;
  is_featured?: number;
  is_default?: number;
  image?: string;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any; // để linh hoạt thêm field khác
}


function toBool01(v: any): boolean {
  if (typeof v === "boolean") return v;
  const n = Number(v);
  if (!Number.isNaN(n)) return n === 1;
  const s = String(v ?? "").toLowerCase();
  return s === "true" || s === "yes" || s === "y";
}

function makeSlug(raw: PostImportItem): string {
  if (raw.slug) return raw.slug;
  if (raw.name) {
    return slugify(raw.name, { lower: true, strict: true, locale: "vi" });
  }
  // fallback tạm
  return slugify(`post-${Date.now()}-${Math.random().toString(16).slice(2)}`, {
    lower: true,
    strict: true,
    locale: "vi",
  });
}

export default factories.createCoreController('api::project-category.project-category', ({ strapi }) => ({
  async import(ctx) {
    try {
      const { files, request } = ctx as any;
      let items: PostImportItem[] = [];

      // 1) Lấy dữ liệu từ file hoặc body
      if (files?.file) {
        const content = await fs.readFile(files.file.path, "utf-8");
        items = JSON.parse(content);
      } else if (request.body?.data) {
        items =
          typeof request.body.data === "string"
            ? JSON.parse(request.body.data)
            : request.body.data;
      } else {
        return ctx.badRequest(
          'Cần gửi file JSON (field "file") hoặc body.data (mảng).'
        );
      }

      if (!Array.isArray(items)) {
        return ctx.badRequest("JSON phải là mảng các bài viết.");
      }

      const results: Array<{ id: number }> = [];

      // 2) Lặp & upsert theo slug
      for (const raw of items) {
        // Trong vòng lặp import:
        const data = {
          // Thêm trường Title (viết hoa) nếu schema yêu cầu
          label: (raw.name ?? "").trim(),

          // Slug: lấy raw.slug; nếu không có thì tạo từ name
          slug: makeSlug(raw),

          // Mô tả ngắn & nội dung
          description: raw.description ?? "",

          // Trạng thái: nếu có Draft & Publish thì publishedAt phụ thuộc status
          publishedAt:
            raw.status?.toLowerCase() === "published"
              ? (raw.publishedAt ?? new Date().toISOString())
              : null,

          created_by_id: 1,

          updated_by_id: 1,

          old_db_id: raw.id,

          // Ghim nổi bật (boolean trong Strapi). Nếu bạn để numeric trong schema thì đổi lại thành số.
          is_featured: toBool01(raw.is_featured),

          is_default: toBool01(raw.is_default),

          order: raw.order,

          // Ảnh đại diện (nếu field trong Strapi là "image" kiểu media ID thì cần upload/resolve trước)
          // Nếu schema của bạn là "image_url" dạng string thì gán trực tiếp:
          image_url: null,

          // Thêm trường Thumbnail nếu schema yêu cầu (giả sử dùng image_url cho Thumbnail)
          thumbnail: null,

          // Thêm trường Publish nếu schema yêu cầu
          Publish: raw.Publish ?? true,

          // Nếu bạn có thêm field khác trong schema, map tại đây…
          // category, tags, author, ...
        };

        const existing = await strapi.db
          .query("api::project-category.project-category")
          .findOne({ where: { slug: data.slug } });

        let entry;
        if (existing) {
          entry = await strapi.entityService.update(
            "api::project-category.project-category",
            existing.id,
            { data }
          );
        } else {
          entry = await strapi.entityService.create("api::project-category.project-category", {
            data,
          });
        }

        results.push({ id: entry.id });
      }

      return ctx.send({ count: results.length, items: results });
    } catch (error) {
      strapi.log.error(error);
      return ctx.internalServerError("Import thất bại.");
    }
  }
}));
