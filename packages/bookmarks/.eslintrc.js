module.exports = {
  rules: {
    "semi": ["error", "never"],
    "space-before-function-paren": [
      "error",
      {
        "asyncArrow": "always",
        "named": "never",
        "anonymous": "never"
      }
    ]
  }
}
