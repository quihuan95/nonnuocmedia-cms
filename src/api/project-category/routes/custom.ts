export default {
  routes: [
    { // Path defined with a URL parameter
      method: 'POST',
      path: '/project-category/import',
      handler: 'project-category.import',
      config: { auth: false }
    }
  ]
}