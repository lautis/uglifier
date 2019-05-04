workflow "Lint" {
  resolves = ["Rubocop"]
  on = "push"
}

action "Rubocop" {
  uses = "lautis/rubocop-action@master"
  secrets = ["GITHUB_TOKEN"]
}
