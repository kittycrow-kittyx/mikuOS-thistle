# Owned type-reuse scope

The local Code Guards runner supplies a separate TypeScript checker view to type reuse. For mikuOS-owned descendants of canonical Thistle's `App`, it removes the property names declared by that upstream base, including overrides of its required command entry point. It retains mikuOS-specific members, including those inherited from local intermediate classes. All other types and the original checker remain unchanged; the remaining guards inspect the full implementation. No upstream dependency changes are required.
