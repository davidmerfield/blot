This module allows us to transform
a file to some arbritrary JSON object
and persist that in the db. The file can
exist on disk or at a URL. This module
only applies the transformation function
to the same file once.

I use this module to upload images in blog
posts, but to only upload the same image once.
If it's already uploaded, this retrieves its
url and dimensions from the database.
As you can imagine, this massively speeds up
saving existing entries, since images don't need
to be reuploaded each time!


Non-goal: concurrent lookup de-duplication
------------------------------------------

The "only applies the transformation function to the same file once"
guarantee is about *repeat* lookups over time: once a result is cached
against the file's content hash, later lookups reuse it and never run the
transform again.

It is NOT a guarantee about lookups that are in flight at the same moment.
If two lookups for the same source race each other before either has
written its result to the cache (for example the image plugin processing a
post that references the same image twice, with several images transformed
concurrently), both will run the transform and both will write the cache.
The writes are idempotent - they key on the same content hash and store an
equivalent result - so the only cost is the duplicated transform work for
that one build.

This is a deliberate, accepted trade-off. We are not going to add an
in-flight promise/lock map to collapse concurrent lookups: it adds shared
mutable state and failure-handling complexity (rejections, eviction, keys
that differ only by path vs. URL vs. case) to a hot path, in exchange for
saving a small amount of one-off work on the rare duplicate. Please do not
re-report this as a bug - if it is costing something real, revisit it here
with numbers first.