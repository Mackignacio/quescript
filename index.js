"use strict";

function $$(el, options = {}) {
  class QueryScript {
    static CONSTANTS = ["$$click"];
    static EVENTS = ["qsValueChange"];
    static REGEX_PATTERN = {
      STR_INTERP: /{{(\w+)}}/g,
      FUNC_NAME: /^(.*?)\((.*?)\);?$/g,
    };

    static addValueChangeEvent({ target, prop, value }) {
      document.dispatchEvent(new CustomEvent(QueryScript.EVENTS[0], { detail: { target, prop, value } }));
    }

    static createData(data) {
      return new Proxy(data, {
        set: function (target, prop, value) {
          //   BROADCAST CHANGE
          QueryScript.addValueChangeEvent({ target, prop, value });
          target[prop] = value;
        },
      });
    }

    constructor(element, { data = {}, methods = {} } = {}) {
      this.element = element;
      this.mapDataKeys(data);
      this.mapDataKeys(methods);
    }

    onLoad() {
      this.mapElement(document.querySelector(this.element));
    }

    onEvent(target) {
      if (target.match(QueryScript.REGEX_PATTERN.FUNC_NAME)) {
        let funcName = "",
          funcArgs = "";

        for (const match of target.matchAll(QueryScript.REGEX_PATTERN.FUNC_NAME)) {
          funcName = match[1];
          funcArgs = match[2];
        }

        const mapArgs = (arg) => {
          const IS_NUMBER = arg.match(/^[0-9]+/g);
          const IS_VARIABLE = !arg.includes("'") && !arg.includes('"');
          return IS_NUMBER ? Number(arg) : IS_VARIABLE ? this[arg] : arg.replace(/'|"/g, "");
        };

        this[funcName](...(funcArgs !== "" ? funcArgs.split(",").map(mapArgs) : []));
      }
    }

    mapElement(element) {
      for (const child of element.children) {
        if (child.innerText.match(QueryScript.REGEX_PATTERN.STR_INTERP)) {
          this.mapStringInterpolation(child);
        }
      }
    }

    mapStringInterpolation(child) {
      let text = child.innerText;
      const textMatches = text.matchAll(QueryScript.REGEX_PATTERN.STR_INTERP);
      const textNode = document.createTextNode("");
      child.innerText = "";
      child.appendChild(textNode);

      for (const match of textMatches) text = text.replace(new RegExp(`{{${match[1]}}}`, "g"), `$\{this.${match[1]}}`);
      const updateTextNode = () => (textNode.nodeValue = new Function(`return \`${text}\``).bind(this)());
      updateTextNode();

      //   LISTENS FOR CHANGES
      document.addEventListener(QueryScript.EVENTS[0], () => updateTextNode());
    }

    mapDataKeys(data) {
      Object.keys(data).map((key) => {
        this[key] = data[key];

        //   LISTENS FOR CHANGES
        document.addEventListener(QueryScript.EVENTS[0], (event) => {
          if (event.detail.prop === key) {
            this[key] = event.detail.value;
          }
        });
      });
    }
  }

  if (el) {
    const qs = new Proxy(new QueryScript(el, options), {
      set: function (target, prop, value) {
        target[prop] = value;

        //   BROADCAST CHANGE
        QueryScript.addValueChangeEvent({ target, prop, value });
        return target[prop];
      },
    });

    document.addEventListener("DOMContentLoaded", () => qs.onLoad());

    document.addEventListener("click", (e) => {
      if (e.target.hasAttribute(QueryScript.CONSTANTS[0])) {
        qs.onEvent(e.target.getAttribute(QueryScript.CONSTANTS[0]));
      }
    });
  }

  return QueryScript;
}
