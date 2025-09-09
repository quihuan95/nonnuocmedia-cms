"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    routes: [
        {
            method: 'POST',
            path: '/project/import',
            handler: 'project.import',
            config: { auth: false }
        },
        {
            method: "POST",
            path: "/project/relink-categories",
            handler: "project.relinkProjectCategories",
            config: { auth: false }
        }
    ]
};
