const fetch = require("node-fetch");
const { parse } = require("url");

module.exports = async function (href, callback) {
  try {
    const { hostname } = parse(href);

    if (!hostname || !hostname.match(/vimeo.com$/)) throw new Error("Invalid Vimeo URL");

    const res = await fetch("https://vimeo.com/api/oembed.json?url=" + encodeURIComponent(href));

    if (!res.ok) throw new Error("Could not retrieve API response from Vimeo");

    const body = await res.json();
    
    if (!body || !body.width || !body.height) throw new Error("Could not retrieve video properties from API response");

    const id = body.video_id;
    // map 'https://i.vimeocdn.com/video/466717816-33ad450eea4c71be9149dbe2e0d18673874917cadd5f1af29de3731e4d22a77f-d_295x166?region=us'
    // to 'https://i.vimeocdn.com/video/466717816-33ad450eea4c71be9149dbe2e0d18673874917cadd5f1af29de3731e4d22a77f-d'
    const thumbnail = body.thumbnail_url.slice(0, body.thumbnail_url.lastIndexOf("-")) + "-d.jpg";
    const height = body.height;
    const width = body.width;
    const ratio = (height / width) * 100;

    // we prepend a zero-width char because of a weird fucking
    // bug on mobile safari where if the embed is the first child,
    // the video player will not show. This causes issues with
    // inline elements displaying (adds extra space) solution needed
    // that doesn't disrupt page layout...
    const embedHTML = `<div style="width:0;height:0"> </div><div class="videoContainer vimeo" style="padding-bottom: ${ratio}%" ><iframe data-thumbnail="${thumbnail}" src="//player.vimeo.com/video/${id}?badge=0&color=ffffff&byline=0&portrait=0" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>`;

    return callback(null, embedHTML);
  } catch (e) {
    return callback(new Error("Could not retrieve video properties"));
  }
};
