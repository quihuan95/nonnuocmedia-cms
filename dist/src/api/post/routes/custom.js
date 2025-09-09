"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    routes: [
        {
            method: 'POST',
            path: '/posts/import',
            handler: 'post.import',
            config: { auth: false }
        },
        {
            method: "POST",
            path: "/posts/relink-categories",
            handler: "post.relinkCategories",
            config: { auth: false }
        }
    ]
};
