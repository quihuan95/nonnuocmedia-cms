export default {
  routes: [
    { // Path defined with a URL parameter
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
}