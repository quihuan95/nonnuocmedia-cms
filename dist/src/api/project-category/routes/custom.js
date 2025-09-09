"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    routes: [
        {
            method: 'POST',
            path: '/project-category/import',
            handler: 'project-category.import',
            config: { auth: false }
        }
    ]
};
