export default {
  routes: [
    { // Path defined with a URL parameter
      method: 'POST',
      path: '/categories/import',
      handler: 'category.import',
      config: { auth: false }
    }
  ]
}