"use strict";
/**
 * project-category controller
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
exports.default = strapi_1.factories.createCoreController('api::project-category.project-category', ({ strapi }) => ({
    async import(ctx) {
        var _a, _b, _c, _d, _e, _f;
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
                    label: ((_b = raw.name) !== null && _b !== void 0 ? _b : "").trim(),
                    // Slug: lấy raw.slug; nếu không có thì tạo từ name
                    slug: makeSlug(raw),
                    // Mô tả ngắn & nội dung
                    description: (_c = raw.description) !== null && _c !== void 0 ? _c : "",
                    // Trạng thái: nếu có Draft & Publish thì publishedAt phụ thuộc status
                    publishedAt: ((_d = raw.status) === null || _d === void 0 ? void 0 : _d.toLowerCase()) === "published"
                        ? ((_e = raw.publishedAt) !== null && _e !== void 0 ? _e : new Date().toISOString())
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
                    Publish: (_f = raw.Publish) !== null && _f !== void 0 ? _f : true,
                    // Nếu bạn có thêm field khác trong schema, map tại đây…
                    // category, tags, author, ...
                };
                const existing = await strapi.db
                    .query("api::project-category.project-category")
                    .findOne({ where: { slug: data.slug } });
                let entry;
                if (existing) {
                    entry = await strapi.entityService.update("api::project-category.project-category", existing.id, { data });
                }
                else {
                    entry = await strapi.entityService.create("api::project-category.project-category", {
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
    }
}));
