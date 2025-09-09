/**
 * category controller
 */

import { factories } from '@strapi/strapi'
import fs from "fs/promises";

interface CategoryImportItem {
	id?: number;
	name?: string;
	description?: string;
	status?: string;
	content?: string;
	is_featured?: number;
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

export default factories.createCoreController('api::category.category', ({ strapi }) => ({
      async import(ctx) {
        try {
          const { files, request } = ctx as any;
          let items: CategoryImportItem[] = [];
  
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
              title: (raw.name ?? "").trim(),

              // Mô tả ngắn & nội dung
              description: raw.description ?? "",
        
              Content: raw.content ?? "",
  
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
  
              // Thêm trường Publish nếu schema yêu cầu
              Publish: raw.Publish ?? true,
  
              // Nếu bạn có thêm field khác trong schema, map tại đây…
              // category, tags, author, ...
            };
  
            const existing = await strapi.db
              .query("api::category.category")
              .findOne({ where: { title: data.title } });
  
            let entry;
            if (existing) {
              entry = await strapi.entityService.update(
                "api::category.category",
                existing.id,
                { data }
              );
            } else {
              entry = await strapi.entityService.create("api::category.category", {
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
      },
}));
