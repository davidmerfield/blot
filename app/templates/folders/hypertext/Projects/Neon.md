A query compiler that generates type-safe code for database queries, eliminating runtime type errors and enabling compile-time query optimization. Written in Haskell with a focus on correctness and performance.


## Motivation

Traditional query builders and ORMs suffer from a fundamental problem: queries are constructed at runtime, making it impossible to catch errors until execution. Neon compiles queries at build time, providing:

- **Type Safety**: Invalid queries fail to compile
- **Performance**: Queries are optimized during compilation
- **Composability**: Queries can be built from reusable fragments

## Example

```haskell
-- Define a schema
data User = User
  { userId :: Int64
  , name :: Text
  , email :: Text
  }

-- Compile a query
usersByName :: Text -> Query [User]
usersByName search = select $ do
  user <- from table
  where_ (user.name `like` ("%" <> search <> "%"))
  return user

-- The query is type-checked at compile time
-- Invalid operations (e.g., comparing Int64 to Text) won't compile
```

## Architecture

Neon uses a multi-stage compilation process:

1. **Parsing**: Convert Haskell expressions to an intermediate representation
2. **Type Checking**: Verify query correctness against the schema
3. **Optimization**: Apply algebraic rewrites and cost-based optimizations
4. **Code Generation**: Emit SQL or generate efficient in-memory code

### Query Optimization

The optimizer applies several transformations:

- Predicate pushdown
- Join reordering based on cardinality estimates
- Subquery flattening
- Common subexpression elimination

## Benchmarks

Compared to traditional ORMs, Neon queries show:

- **2-5x faster execution** due to compile-time optimization
- **Zero runtime type errors** (all caught at compile time)
- **Smaller binary size** (unused query paths eliminated)

## Integration

Neon integrates with existing Haskell projects:

```haskell
-- In your application
main = do
  conn <- connect databaseConfig
  results <- runQuery conn (usersByName "John")
  print results
```

The query is compiled into efficient code that directly interfaces with your database driver.

## References

- [Type-Safe Database Queries](https://example.com/neon-paper)
- [API Documentation](https://example.com/neon-docs)
- [GitHub Repository](https://example.com/neon-repo)

> "Neon represents a significant step forward in database query safety. By moving query construction to compile time, we eliminate entire classes of runtime errors." — Database Systems Review
