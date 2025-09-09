/**
 * project controller
 */

import { Data, factories } from '@strapi/strapi'
import fs from "fs/promises";
import slugify from "slugify";
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import tz from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(utc);
dayjs.extend(tz);
dayjs.extend(customParseFormat);

interface ProjectImportItem {
  id?: number;
  name?: string;
  slug?: string;
  description?: string;
  content?: string;
  status?: string;
  address?: string;
  items?: string;
  is_featured?: number;
  image?: string;
  views?: number;
  scale?: number;
  date_venue?: string | null;
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

function makeSlug(raw: ProjectImportItem): string {
  if (raw.slug) return raw.slug;
  if (raw.name) {
    return slugify(raw.name, { lower: true, strict: true, locale: "vi" });
  }
  // fallback tạm
  return slugify(`project-${Date.now()}-${Math.random().toString(16).slice(2)}`, {
    lower: true,
    strict: true,
    locale: "vi",
  });
}

function toStrapiDateTime(input: string): string {
  const parsed = dayjs(
    input.trim(),
    ['D/M/YYYY HH:mm:ss', 'D/M/YYYY H:mm:ss', 'D/M/YYYY', 'DD/MM/YYYY HH:mm:ss'],
    true
  );
  if (!parsed.isValid()) throw new Error(`Invalid date_venue: "${input}"`);
  return parsed.tz('Asia/Bangkok').toISOString();
}


export default factories.createCoreController('api::project.project', ({ strapi }) => ({
  async import(ctx) {
    try {
      const { files, request } = ctx as any;
      let items: ProjectImportItem[] = [];

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

      const results: Array<{ id: number, old_db_id: Number }> = [];

      // 2) Lặp & upsert theo slug
      for (const raw of items) {
        // Trong vòng lặp import:
        const data = {
          // Thêm trường Title (viết hoa) nếu schema yêu cầu
          title: (raw.name ?? "").trim(),

          // Slug: lấy raw.slug; nếu không có thì tạo từ name
          slug: makeSlug(raw),

          // Mô tả ngắn & nội dung
          description: raw.description ?? "",

          content: raw.content ?? "",

          // Trạng thái: nếu có Draft & Publish thì publishedAt phụ thuộc status
          publishedAt:
            raw.status?.toLowerCase() === "published"
              ? (raw.publishedAt ?? new Date().toISOString())
              : null,

          created_by_id: 1,

          updated_by_id: 1,

          old_db_id: raw.id,

          // Ghim nổi bật (boolean trong Strapi). Nếu bạn để numeric trong schema thì đổi lại thành số.
          isFeatured: toBool01(raw.is_featured),

          // Lượt xem
          views: Number.isFinite(Number(raw.views)) ? Number(raw.views) : 0,

          // Ảnh đại diện (nếu field trong Strapi là "image" kiểu media ID thì cần upload/resolve trước)
          // Nếu schema của bạn là "image_url" dạng string thì gán trực tiếp:
          image_url: null,

          // Thêm trường Thumbnail nếu schema yêu cầu (giả sử dùng image_url cho Thumbnail)
          thumbnail: null,

          scale: Number(raw.scale ?? 0),

          address: raw.address ?? null,

          dateVenue: toStrapiDateTime(raw.date_venue)

          // Nếu bạn có thêm field khác trong schema, map tại đây…
          // category, tags, author, ...
        };

        const existing = await strapi.db
          .query("api::project.project")
          .findOne({ where: { slug: data.slug } });
        let entry;
        if (existing) {
          entry = await strapi.entityService.update(
            "api::project.project",
            existing.id,
            { data }
          );
        } else {
          entry = await strapi.entityService.create("api::project.project", {
            data,
          });
        }

        results.push({ id: entry.id, old_db_id: entry.old_db_id });
      }

      return ctx.send({ count: results.length, items: results });
    } catch (error) {
      strapi.log.error(error);
      return ctx.internalServerError("Import thất bại.");
    }
  },
  async relinkProjectCategories(ctx) {
    const data = ctx.request.body?.data;
    if (!Array.isArray(data)) {
      return ctx.badRequest("Body.data phải là mảng [{ category_id, post_id }]");
    }

    const PROJECT_UID = "api::project.project";
    const PROJECT_CATEGORY_UID = "api::project-category.project-category";

    // Lấy danh sách old_id từ input
    const projectOldIds = Array.from(new Set(data.map(i => String(i.post_id))));
    const projectCatOldIds = Array.from(new Set(data.map(i => String(i.category_id))));

    // Lấy Post theo old_db_id
    const project = await strapi.entityService.findMany(PROJECT_UID, {
      filters: { old_db_id: { $in: projectOldIds } },
      fields: ["id", "old_db_id"],
      limit: projectOldIds.length
    });
    const postByOldId = new Map(project.map((p: any) => [String(p.old_db_id), p]));

    // Lấy Category theo old_db_id
    const projectCategories = await strapi.entityService.findMany(PROJECT_CATEGORY_UID, {
      filters: { old_db_id: { $in: projectCatOldIds } },
      fields: ["id", "old_db_id"],
      limit: projectCatOldIds.length
    });
    const catByOldId = new Map(projectCategories.map((c: any) => [String(c.old_db_id), c]));

    // Gom categoryIds theo project.id mới
    const perProjectCategoryIds = new Map<number, Set<number>>();
    const missingProjects: Array<string | number> = [];
    const missingProjectCategories: Array<string | number> = [];

    for (const { post_id, category_id } of data) {
      const project = postByOldId.get(String(post_id));
      if (!project) { missingProjects.push(post_id); continue; }

      const cat = catByOldId.get(String(category_id));
      if (!cat) { missingProjectCategories.push(category_id); continue; }

      if (!perProjectCategoryIds.has(project.id)) perProjectCategoryIds.set(project.id, new Set());
      perProjectCategoryIds.get(project.id)!.add(cat.id);
    }

    // Update quan hệ M2M
    let updatedPosts = 0;
    await strapi.db.transaction(async ({ trx }) => {
      for (const [projectId, catIdSet] of perProjectCategoryIds) {
        await strapi.entityService.update(PROJECT_UID, projectId, {
          data: { categories: Array.from(catIdSet) } as any,
          transacting: trx as any
        });
        updatedPosts++;
      }
    });

    ctx.send({
      updatedPosts,
      missingProjects: Array.from(new Set(missingProjects)),
      missingProjectCategories: Array.from(new Set(missingProjectCategories))
    });
  }
}));
