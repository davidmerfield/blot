$(document).ready(function () {
  $("#redirects").on("click", ".removeLink", function (e) {
    $(this).parent().remove();
    e.preventDefault();
    return false;
  });

  $("#menu").on("click", ".removeLink", function (e) {
    $(this).parent().remove();
    e.preventDefault();
    return false;
  });


  if ($(".sortable")[0]) {
    Sortable.create($(".sortable")[0], {
      handle: ".handle",
      ghostClass: "sortable-ghost",
      onUpdate: function () {
        $(".sortable")
          .find("section")
          .each(function () {
            var index = $(this).index();

            $(this)
              .find("input")
              .each(function () {
                var name = $(this).attr("name");
                var newName =
                  name.slice(0, name.indexOf(".") + 1) +
                  index +
                  name.slice(name.lastIndexOf("."));

                $(this).attr("name", newName);

                console.log(name + " > " + newName);
              });

            console.log("");
          });
      },
    });
  }

  
});
