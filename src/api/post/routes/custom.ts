export default {
  routes: [
    { // Path defined with a URL parameter
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
}