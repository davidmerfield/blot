// Date sorting in models/entries inverts typical asc/desc:
// sort_order "asc" is newest-first, "desc" is oldest-first.
// Path sorting is lexicographic: "asc" is A–Z, "desc" is Z–A.
module.exports = [
  {
    label: "Publish date - Newest first",
    sort_by: "date",
    sort_order: "asc",
    value: "date_asc"
  },
  {
    label: "Publish date - Oldest first",
    sort_by: "date",
    sort_order: "desc",
    value: "date_desc"
  },
  {
    label: "File path - A to Z",
    sort_by: "id",
    sort_order: "asc",
    value: "id_asc"
  },
  {
    label: "File path - Z to A",
    sort_by: "id",
    sort_order: "desc",
    value: "id_desc"
  }
];

module.exports.DEFAULT = {
  sort_by: "date",
  sort_order: "asc"
};
