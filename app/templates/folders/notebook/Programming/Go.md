I've spent a decent amount of time writing [[aft]] in Go, and it's become one of my favorite programming languages.

Go's approach to object-orientation offers tools for simple code-sharing. Large inheritence hierarchies with mix-ins in Java or TypeScript split code in confusing, hard to follow ways. But Go's type-embedding allows for wrapping, extending, and collaborating without sharing private state or implementation, and without forcing the programmer to wade through lots of trivial proxy functions.

Structural interfaces also allow for uncomplicated dependencies, though the fact that [interfaces are values](https://go.dev/tour/methods/11) can have some unintuitive results.

The standard library is useful without being enormous, and it offers more than just generic utilities: it offers tasteful guidance about how to structure certain classes of program. The [Context](https://pkg.go.dev/context) package is a nice example. Instead of Go developers relying on a request object, or threadlocals, the Go standard library offers a convention for passing around environmental state explicitly.

Of course other common reasons to praise Go are true as well: the compiler is fast, `gofmt` is a rightly copied innovation, and Go's dependency management (now) is mature and sensible.

The image I have of Go is that it has been thoughtfully written and maintained by a relatively small group of highly experienced and opinionated developers. When faced with design questions in any language, I often find myself thinking, "how would I do this in Go," as a starting point.