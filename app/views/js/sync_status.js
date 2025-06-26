
// when the document is ready
document.addEventListener("DOMContentLoaded", function () {


  // get the status container
  var statusContainer = document.querySelector(".sync-status");

    // if no status container, return
    if (!statusContainer) return;

    var syncStatusURL = statusContainer.getAttribute("data-sync-status-url");

    if (!syncStatusURL) {
      console.error("No sync status URL provided.");
      return;
    }

  // https://www.npmjs.com/package/reconnecting-eventsource
var _ReconnectingEventSource;(()=>{"use strict";var e={19:(e,t)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.EventSourceNotAvailableError=void 0;class n extends Error{constructor(){super("EventSource not available.\nConsider loading an EventSource polyfill and making it available globally as EventSource, or passing one in as eventSourceClass to the ReconnectingEventSource constructor.")}}t.EventSourceNotAvailableError=n,t.default=class{constructor(e,t){if(this.CONNECTING=0,this.OPEN=1,this.CLOSED=2,this._configuration=null!=t?Object.assign({},t):void 0,this.withCredentials=!1,this._eventSource=null,this._lastEventId=null,this._timer=null,this._listeners={},this.url=e.toString(),this.readyState=this.CONNECTING,this.max_retry_time=3e3,this.eventSourceClass=globalThis.EventSource,null!=this._configuration&&(this._configuration.lastEventId&&(this._lastEventId=this._configuration.lastEventId,delete this._configuration.lastEventId),this._configuration.max_retry_time&&(this.max_retry_time=this._configuration.max_retry_time,delete this._configuration.max_retry_time),this._configuration.eventSourceClass&&(this.eventSourceClass=this._configuration.eventSourceClass,delete this._configuration.eventSourceClass)),null==this.eventSourceClass||"function"!=typeof this.eventSourceClass)throw new n;this._onevent_wrapped=e=>{this._onevent(e)},this._start()}dispatchEvent(e){throw new Error("Method not implemented.")}_start(){let e=this.url;this._lastEventId&&(-1===e.indexOf("?")?e+="?":e+="&",e+="lastEventId="+encodeURIComponent(this._lastEventId)),this._eventSource=new this.eventSourceClass(e,this._configuration),this._eventSource.onopen=e=>{this._onopen(e)},this._eventSource.onerror=e=>{this._onerror(e)},this._eventSource.onmessage=e=>{this.onmessage(e)};for(const e of Object.keys(this._listeners))this._eventSource.addEventListener(e,this._onevent_wrapped)}_onopen(e){0===this.readyState&&(this.readyState=1,this.onopen(e))}_onerror(e){if(1===this.readyState&&(this.readyState=0,this.onerror(e)),this._eventSource&&2===this._eventSource.readyState){this._eventSource.close(),this._eventSource=null;const e=Math.round(this.max_retry_time*Math.random());this._timer=setTimeout((()=>this._start()),e)}}_onevent(e){e instanceof MessageEvent&&(this._lastEventId=e.lastEventId);const t=this._listeners[e.type];if(null!=t)for(const n of[...t])n.call(this,e);"message"===e.type&&this.onmessage(e)}onopen(e){}onerror(e){}onmessage(e){}close(){this._timer&&(clearTimeout(this._timer),this._timer=null),this._eventSource&&(this._eventSource.close(),this._eventSource=null),this.readyState=2}addEventListener(e,t,n){e in this._listeners||(this._listeners[e]=[],null!=this._eventSource&&this._eventSource.addEventListener(e,this._onevent_wrapped));const s=this._listeners[e];Array.isArray(s)&&!s.includes(t)&&s.push(t)}removeEventListener(e,t,n){const s=this._listeners[e];if(null!=s){for(;;){const e=s.indexOf(t);if(-1===e)break;s.splice(e,1)}s.length<=0&&(delete this._listeners[e],null!=this._eventSource&&this._eventSource.removeEventListener(e,this._onevent_wrapped))}}}}},t={};function n(s){var i=t[s];if(void 0!==i)return i.exports;var r=t[s]={exports:{}};return e[s](r,r.exports,n),r.exports}var s={};(()=>{var e=s;Object.defineProperty(e,"__esModule",{value:!0});const t=n(19);Object.assign(window,{ReconnectingEventSource:t.default,EventSourceNotAvailableError:t.EventSourceNotAvailableError})})(),_ReconnectingEventSource=s})();
//# sourceMappingURL=ReconnectingEventSource.min.js.map

var evtSource = new ReconnectingEventSource(syncStatusURL);

var currentlyLoading;
var lastStatus;
var checkAgain;



  evtSource.onmessage = function (event) {


    var message = event.data;

    // Map long path to just filename, e.g.
    // 'Syncing /foo/bar/baz.txt' => 'Syncing baz.txt'
    if (message.startsWith('Syncing /')) {
      var path = message.slice('Syncing '.length);
      var filename = path.split('/').pop();
      message = 'Syncing ' + filename;
    } 

    statusContainer.removeAttribute('data-text');
    statusContainer.innerHTML = message;

    if (event.data === "Synced") {
      statusContainer.classList.remove('syncing');
    } else {
      statusContainer.classList.add("syncing");
    }

    lastStatus = event.data;

    // Fetch the latest folder state if we're not
    // already fetching it.
    if (currentlyLoading) {
      checkAgain = true;
      return;
    }

    currentlyLoading = true;

    if (document.querySelector(".live-updates")) loadFolder(function onLoad() {
      currentlyLoading = false;

      if (checkAgain === true) {
        checkAgain = false;
        return loadFolder(onLoad);
      }
    });
  };

  function loadFolder(callback) {
    var xhr = new XMLHttpRequest();

    xhr.onreadystatechange = function (e) {
      if (xhr.readyState == 4 && xhr.status == 200) {
        var parser = new DOMParser();
        var xml = parser.parseFromString(xhr.responseText, "text/html");

        var currentNode = document.querySelector(".live-updates");
        var newNode = xml.querySelector(".live-updates");

        if (currentNode !== null && newNode !== null) {
          var currentState = currentNode.innerHTML;
          var newState = newNode.innerHTML;

          if (newState === currentState) return callback();


          currentNode.innerHTML = newState;

          try {
            sortTable();
          } catch (e) {
            console.error(e);
          }

          try {
            initCopyButtons()
          } catch (e) {
            console.error(e);
          }
        }

        callback();
      }
    };

    xhr.open("GET", window.location, true);
    xhr.setRequestHeader("Content-type", "text/html");
    xhr.send();
  }

});