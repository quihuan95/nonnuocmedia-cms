/**
 * post controller
 */

import { factories } from "@strapi/strapi";
import fs from "fs/promises";
import slugify from "slugify";

interface PostImportItem {
	id?: number;
	name?: string;
	description?: string;
	content?: string;
	status?: string;
	is_featured?: number;
	image?: string;
	views?: number;
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

export default factories.createCoreController(
	"api::post.post",
	({ strapi }) => ({
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
						Title: (raw.name ?? "").trim(),

						// Slug: lấy raw.slug; nếu không có thì tạo từ name
						slug: makeSlug(raw),

						// Mô tả ngắn & nội dung
						Description: raw.description ?? "",

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
						Is_featured: toBool01(raw.is_featured),

						// Lượt xem
						Views: Number.isFinite(Number(raw.views)) ? Number(raw.views) : 0,

						// Ảnh đại diện (nếu field trong Strapi là "image" kiểu media ID thì cần upload/resolve trước)
						// Nếu schema của bạn là "image_url" dạng string thì gán trực tiếp:
						image_url: null,

						// Thêm trường Thumbnail nếu schema yêu cầu (giả sử dùng image_url cho Thumbnail)
						Thumbnail: null,

						// Thêm trường Publish nếu schema yêu cầu
						Publish: raw.Publish ?? true,

						// Nếu bạn có thêm field khác trong schema, map tại đây…
						// category, tags, author, ...
					};

					const existing = await strapi.db
						.query("api::post.post")
						.findOne({ where: { slug: data.slug } });

					let entry;
					if (existing) {
						entry = await strapi.entityService.update(
							"api::post.post",
							existing.id,
							{ data }
						);
					} else {
						entry = await strapi.entityService.create("api::post.post", {
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
		async relinkCategories(ctx) {
			const data = ctx.request.body?.data;
			if (!Array.isArray(data)) {
				return ctx.badRequest("Body.data phải là mảng [{ category_id, post_id }]");
			}

			const POST_UID = "api::post.post";
			const CAT_UID = "api::category.category";

			// Lấy danh sách old_id từ input
			const postOldIds = Array.from(new Set(data.map(i => String(i.post_id))));
			const catOldIds = Array.from(new Set(data.map(i => String(i.category_id))));

			// Lấy Post theo old_db_id
			const posts = await strapi.entityService.findMany(POST_UID, {
				filters: { old_db_id: { $in: postOldIds } },
				fields: ["id", "old_db_id"],
				limit: postOldIds.length
			});
			const postByOldId = new Map(posts.map((p: any) => [String(p.old_db_id), p]));

			// Lấy Category theo old_db_id
			const cats = await strapi.entityService.findMany(CAT_UID, {
				filters: { old_db_id: { $in: catOldIds } },
				fields: ["id", "old_db_id"],
				limit: catOldIds.length
			});
			const catByOldId = new Map(cats.map((c: any) => [String(c.old_db_id), c]));

			// Gom categoryIds theo post.id mới
			const perPostCatIds = new Map<number, Set<number>>();
			const missingPosts: Array<string | number> = [];
			const missingCategories: Array<string | number> = [];

			for (const { post_id, category_id } of data) {
				const post = postByOldId.get(String(post_id));
				if (!post) { missingPosts.push(post_id); continue; }

				const cat = catByOldId.get(String(category_id));
				if (!cat) { missingCategories.push(category_id); continue; }

				if (!perPostCatIds.has(post.id)) perPostCatIds.set(post.id, new Set());
				perPostCatIds.get(post.id)!.add(cat.id);
			}

			// Update quan hệ M2M
			let updatedPosts = 0;
			await strapi.db.transaction(async ({ trx }) => {
				for (const [postId, catIdSet] of perPostCatIds) {
					await strapi.entityService.update(POST_UID, postId, {
						data: { categories: Array.from(catIdSet) } as any,
						transacting: trx as any
					});
					updatedPosts++;
				}
			});

			ctx.send({
				updatedPosts,
				missingPosts: Array.from(new Set(missingPosts)),
				missingCategories: Array.from(new Set(missingCategories))
			});
		}
	})
);
