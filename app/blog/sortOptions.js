module.exports = function getTemplateSortOptions (locals) {
  const sort = locals?.sort;

  return {
    sortBy: sort?.by ?? locals?.sort_by,
    order: sort?.direction ?? sort?.order ?? locals?.sort_order,
  };
};
