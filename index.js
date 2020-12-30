"use strict";

class QueScript {
  static CONSTANTS = ["@click"];
  static EVENTS = ["qsValueChange"];
  static REGEX_PATTERN = {
    STR_INTERP: /{{(\w+)}}/g,
    FUNC_NAME: /^\w+?\(\)$/,
  };

  static addValueChangeEvent({ target, prop, value }) {
    document.dispatchEvent(new CustomEvent(QueScript.EVENTS[0], { detail: { target, prop, value } }));
  }

  static createData(data) {
    return new Proxy(data, {
      set: function (target, prop, value) {
        //   BROADCAST CHANGE
        QueScript.addValueChangeEvent({ target, prop, value });
        target[prop] = value;
      },
    });
  }
}

function $$(el, options = {}) {
  class QS {
    element = "";

    constructor(element, { data = {}, methods = {} } = {}) {
      this.element = element;
      this.mapDataKeys(data);
      this.mapDataKeys(methods);
    }

    onLoad() {
      this.mapElement(document.querySelector(this.element));
    }

    onEvent(target) {
      if (target.match(QueScript.REGEX_PATTERN.FUNC_NAME)) {
        this[target.replace("()", "")]();
      }
    }

    mapElement(element) {
      for (const child of element.children) {
        if (child.innerText.match(QueScript.REGEX_PATTERN.STR_INTERP)) {
          this.mapStringInterpolation(child);
        }
      }
    }

    mapStringInterpolation(child) {
      let text = child.innerText;
      const textMatches = text.matchAll(QueScript.REGEX_PATTERN.STR_INTERP);
      const textNode = document.createTextNode("");
      child.innerText = "";
      child.appendChild(textNode);

      for (const match of textMatches) text = text.replace(new RegExp(`{{${match[1]}}}`, "g"), `$\{this.${match[1]}}`);
      const updateTextNode = () => (textNode.nodeValue = new Function(`return \`${text}\``).bind(this)());
      updateTextNode();

      //   LISTENS FOR CHANGES
      document.addEventListener(QueScript.EVENTS[0], () => updateTextNode());
    }

    mapDataKeys(data) {
      Object.keys(data).map((key) => {
        this[key] = data[key];

        //   LISTENS FOR CHANGES
        document.addEventListener(QueScript.EVENTS[0], (event) => {
          if (event.detail.prop === key) {
            this[key] = event.detail.value;
          }
        });
      });
    }
  }

  const qs = new Proxy(new QS(el, options), {
    set: function (target, prop, value) {
      target[prop] = value;

      //   BROADCAST CHANGE
      QueScript.addValueChangeEvent({ target, prop, value });
      return target[prop];
    },
  });

  document.addEventListener("DOMContentLoaded", () => qs.onLoad());

  document.addEventListener("click", (e) => {
    if (e.target.hasAttribute(QueScript.CONSTANTS[0])) {
      qs.onEvent(e.target.getAttribute(QueScript.CONSTANTS[0]));
    }
  });
}

$$["addValueChangeEvent"] = QueScript.addValueChangeEvent;
$$["createData"] = QueScript.createData;
