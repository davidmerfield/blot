module.exports = {
  metadata: function metadata (name) {
    return "template:" + name + ":info";
  },

  view: function view (name, viewName) {
    return "template:" + name + ":view:" + viewName;
  },

  urlPatterns: function urlPatterns (name) {
    return "template:" + name + ":url_patterns";
  },
  
  url: function url (templateID, url) {
    return "template:" + templateID + ":url:" + url;
  },

  share: function (shareID) {
    return "template:share:" + shareID;
  },

  allViews: function allViews (name) {
    return "template:" + name + ":all_views";
  },

  publicTemplates: function publicTemplates () {
    return "template:public_templates";
  },

  blogTemplates: function blogTemplates (blogID) {
    return "template:owned_by:" + blogID;
  }
};
