"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    routes: [
        {
            method: 'POST',
            path: '/categories/import',
            handler: 'category.import',
            config: { auth: false }
        }
    ]
};
