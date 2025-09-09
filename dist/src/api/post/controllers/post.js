"use strict";
/**
 * post controller
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strapi_1 = require("@strapi/strapi");
const promises_1 = __importDefault(require("fs/promises"));
const slugify_1 = __importDefault(require("slugify"));
function toBool01(v) {
    if (typeof v === "boolean")
        return v;
    const n = Number(v);
    if (!Number.isNaN(n))
        return n === 1;
    const s = String(v !== null && v !== void 0 ? v : "").toLowerCase();
    return s === "true" || s === "yes" || s === "y";
}
function makeSlug(raw) {
    if (raw.slug)
        return raw.slug;
    if (raw.name) {
        return (0, slugify_1.default)(raw.name, { lower: true, strict: true, locale: "vi" });
    }
    // fallback tạm
    return (0, slugify_1.default)(`post-${Date.now()}-${Math.random().toString(16).slice(2)}`, {
        lower: true,
        strict: true,
        locale: "vi",
    });
}
exports.default = strapi_1.factories.createCoreController("api::post.post", ({ strapi }) => ({
    async import(ctx) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
            const { files, request } = ctx;
            let items = [];
            // 1) Lấy dữ liệu từ file hoặc body
            if (files === null || files === void 0 ? void 0 : files.file) {
                const content = await promises_1.default.readFile(files.file.path, "utf-8");
                items = JSON.parse(content);
            }
            else if ((_a = request.body) === null || _a === void 0 ? void 0 : _a.data) {
                items =
                    typeof request.body.data === "string"
                        ? JSON.parse(request.body.data)
                        : request.body.data;
            }
            else {
                return ctx.badRequest('Cần gửi file JSON (field "file") hoặc body.data (mảng).');
            }
            if (!Array.isArray(items)) {
                return ctx.badRequest("JSON phải là mảng các bài viết.");
            }
            const results = [];
            // 2) Lặp & upsert theo slug
            for (const raw of items) {
                // Trong vòng lặp import:
                const data = {
                    // Thêm trường Title (viết hoa) nếu schema yêu cầu
                    Title: ((_b = raw.name) !== null && _b !== void 0 ? _b : "").trim(),
                    // Slug: lấy raw.slug; nếu không có thì tạo từ name
                    slug: makeSlug(raw),
                    // Mô tả ngắn & nội dung
                    Description: (_c = raw.description) !== null && _c !== void 0 ? _c : "",
                    Content: (_d = raw.content) !== null && _d !== void 0 ? _d : "",
                    // Trạng thái: nếu có Draft & Publish thì publishedAt phụ thuộc status
                    publishedAt: ((_e = raw.status) === null || _e === void 0 ? void 0 : _e.toLowerCase()) === "published"
                        ? ((_f = raw.publishedAt) !== null && _f !== void 0 ? _f : new Date().toISOString())
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
                    Publish: (_g = raw.Publish) !== null && _g !== void 0 ? _g : true,
                    // Nếu bạn có thêm field khác trong schema, map tại đây…
                    // category, tags, author, ...
                };
                const existing = await strapi.db
                    .query("api::post.post")
                    .findOne({ where: { slug: data.slug } });
                let entry;
                if (existing) {
                    entry = await strapi.entityService.update("api::post.post", existing.id, { data });
                }
                else {
                    entry = await strapi.entityService.create("api::post.post", {
                        data,
                    });
                }
                results.push({ id: entry.id });
            }
            return ctx.send({ count: results.length, items: results });
        }
        catch (error) {
            strapi.log.error(error);
            return ctx.internalServerError("Import thất bại.");
        }
    },
    async relinkCategories(ctx) {
        var _a;
        const data = (_a = ctx.request.body) === null || _a === void 0 ? void 0 : _a.data;
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
        const postByOldId = new Map(posts.map((p) => [String(p.old_db_id), p]));
        // Lấy Category theo old_db_id
        const cats = await strapi.entityService.findMany(CAT_UID, {
            filters: { old_db_id: { $in: catOldIds } },
            fields: ["id", "old_db_id"],
            limit: catOldIds.length
        });
        const catByOldId = new Map(cats.map((c) => [String(c.old_db_id), c]));
        // Gom categoryIds theo post.id mới
        const perPostCatIds = new Map();
        const missingPosts = [];
        const missingCategories = [];
        for (const { post_id, category_id } of data) {
            const post = postByOldId.get(String(post_id));
            if (!post) {
                missingPosts.push(post_id);
                continue;
            }
            const cat = catByOldId.get(String(category_id));
            if (!cat) {
                missingCategories.push(category_id);
                continue;
            }
            if (!perPostCatIds.has(post.id))
                perPostCatIds.set(post.id, new Set());
            perPostCatIds.get(post.id).add(cat.id);
        }
        // Update quan hệ M2M
        let updatedPosts = 0;
        await strapi.db.transaction(async ({ trx }) => {
            for (const [postId, catIdSet] of perPostCatIds) {
                await strapi.entityService.update(POST_UID, postId, {
                    data: { categories: Array.from(catIdSet) },
                    transacting: trx
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
}));
