module.exports = function getTemplateSortOptions (locals) {
  const sort = locals?.sort;

  return {
    sortBy: sort?.by ?? locals?.sort_by,
    order: sort?.direction ?? locals?.sort_order,
  };
};
