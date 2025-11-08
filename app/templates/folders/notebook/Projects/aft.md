---
pub: true
---

You can learn more about Aft at [aft.dev](https://aft.dev).

After leaving [Welkin Health](https://welkinhealth.com/), I wanted to make the kind of apps we were building there easier.

Many of our customers didn't have intensive data requirements—many would fit on a single machine. But rapid feature implementation, platform flexbility, powerful access controls, and other enterprise features were difficult requirements.

We built several python services ontop of a large PostgreSQL database.

PostgreSQL offers many sophisticted features useful for a configurable platform like:

-   User management
-   Row level auth
-   Flexibly schema'd JSON querying

But these often ended up being an awkward fit with our application code.

Further, we often found that customers came with arbitrarily complicated and idiosyncratic frontend requirements. We were challenged to provide a UI that provided a lot of features out of the box, but allowed the flexibility to meet our customer's needs.

Aft attempts to offer an application development platform for highly dynamic apps that don't need to scale beyond a single machine.

It is a frontend agnostic tool, so apps built on Aft can have best-in-class user experiences.

Aft is currently a work in progress. The code is available on [GitHub](https://github.com/awans/aft).