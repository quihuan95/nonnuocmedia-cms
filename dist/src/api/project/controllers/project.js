"use strict";
/**
 * project controller
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strapi_1 = require("@strapi/strapi");
const promises_1 = __importDefault(require("fs/promises"));
const slugify_1 = __importDefault(require("slugify"));
const dayjs_1 = __importDefault(require("dayjs"));
const utc_1 = __importDefault(require("dayjs/plugin/utc"));
const timezone_1 = __importDefault(require("dayjs/plugin/timezone"));
const customParseFormat_1 = __importDefault(require("dayjs/plugin/customParseFormat"));
dayjs_1.default.extend(utc_1.default);
dayjs_1.default.extend(timezone_1.default);
dayjs_1.default.extend(customParseFormat_1.default);
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
    return (0, slugify_1.default)(`project-${Date.now()}-${Math.random().toString(16).slice(2)}`, {
        lower: true,
        strict: true,
        locale: "vi",
    });
}
function toStrapiDateTime(input) {
    const parsed = (0, dayjs_1.default)(input.trim(), ['D/M/YYYY HH:mm:ss', 'D/M/YYYY H:mm:ss', 'D/M/YYYY', 'DD/MM/YYYY HH:mm:ss'], true);
    if (!parsed.isValid())
        throw new Error(`Invalid date_venue: "${input}"`);
    return parsed.tz('Asia/Bangkok').toISOString();
}
exports.default = strapi_1.factories.createCoreController('api::project.project', ({ strapi }) => ({
    async import(ctx) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
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
                    title: ((_b = raw.name) !== null && _b !== void 0 ? _b : "").trim(),
                    // Slug: lấy raw.slug; nếu không có thì tạo từ name
                    slug: makeSlug(raw),
                    // Mô tả ngắn & nội dung
                    description: (_c = raw.description) !== null && _c !== void 0 ? _c : "",
                    content: (_d = raw.content) !== null && _d !== void 0 ? _d : "",
                    // Trạng thái: nếu có Draft & Publish thì publishedAt phụ thuộc status
                    publishedAt: ((_e = raw.status) === null || _e === void 0 ? void 0 : _e.toLowerCase()) === "published"
                        ? ((_f = raw.publishedAt) !== null && _f !== void 0 ? _f : new Date().toISOString())
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
                    scale: Number((_g = raw.scale) !== null && _g !== void 0 ? _g : 0),
                    address: (_h = raw.address) !== null && _h !== void 0 ? _h : null,
                    dateVenue: toStrapiDateTime(raw.date_venue)
                    // Nếu bạn có thêm field khác trong schema, map tại đây…
                    // category, tags, author, ...
                };
                const existing = await strapi.db
                    .query("api::project.project")
                    .findOne({ where: { slug: data.slug } });
                let entry;
                if (existing) {
                    entry = await strapi.entityService.update("api::project.project", existing.id, { data });
                }
                else {
                    entry = await strapi.entityService.create("api::project.project", {
                        data,
                    });
                }
                results.push({ id: entry.id, old_db_id: entry.old_db_id });
            }
            return ctx.send({ count: results.length, items: results });
        }
        catch (error) {
            strapi.log.error(error);
            return ctx.internalServerError("Import thất bại.");
        }
    },
    async relinkProjectCategories(ctx) {
        var _a;
        const data = (_a = ctx.request.body) === null || _a === void 0 ? void 0 : _a.data;
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
        const postByOldId = new Map(project.map((p) => [String(p.old_db_id), p]));
        // Lấy Category theo old_db_id
        const projectCategories = await strapi.entityService.findMany(PROJECT_CATEGORY_UID, {
            filters: { old_db_id: { $in: projectCatOldIds } },
            fields: ["id", "old_db_id"],
            limit: projectCatOldIds.length
        });
        const catByOldId = new Map(projectCategories.map((c) => [String(c.old_db_id), c]));
        // Gom categoryIds theo project.id mới
        const perProjectCategoryIds = new Map();
        const missingProjects = [];
        const missingProjectCategories = [];
        for (const { post_id, category_id } of data) {
            const project = postByOldId.get(String(post_id));
            if (!project) {
                missingProjects.push(post_id);
                continue;
            }
            const cat = catByOldId.get(String(category_id));
            if (!cat) {
                missingProjectCategories.push(category_id);
                continue;
            }
            if (!perProjectCategoryIds.has(project.id))
                perProjectCategoryIds.set(project.id, new Set());
            perProjectCategoryIds.get(project.id).add(cat.id);
        }
        // Update quan hệ M2M
        let updatedPosts = 0;
        await strapi.db.transaction(async ({ trx }) => {
            for (const [projectId, catIdSet] of perProjectCategoryIds) {
                await strapi.entityService.update(PROJECT_UID, projectId, {
                    data: { categories: Array.from(catIdSet) },
                    transacting: trx
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
