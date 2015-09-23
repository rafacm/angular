import {
  ddescribe,
  describe,
  it,
  iit,
  xit,
  expect,
  beforeEach,
  afterEach,
  el
} from 'angular2/test_lib';
import {ControlGroup, Control, Validators} from 'angular2/core';

export function main() {
  function validator(key: string, error: any) {
    return function(c: Control) {
      var r = {};
      r[key] = error;
      return r;
    }
  }

  describe("Validators", () => {
    describe("required", () => {
      it("should error on an empty string",
         () => { expect(Validators.required(new Control(""))).toEqual({"required": true}); });

      it("should error on null",
         () => { expect(Validators.required(new Control(null))).toEqual({"required": true}); });

      it("should not error on a non-empty string",
         () => { expect(Validators.required(new Control("not empty"))).toEqual(null); });
    });

    describe("minlength", () => {
      it("should error on an empty string and minlegth = 1",
          () => { expect(Validators.minlength(1)(new Control(""))).toEqual({"minlength": 1 }); });

      it("should not error on a string longer than minlegth",
          () => { expect(Validators.minlength(1)(new Control("abc"))).toEqual(null); });

      it("should error on a string shorter than minlegth",
          () => { expect(Validators.minlength(4)(new Control("abc"))).toEqual({"minlength": 4 }); });
    });

    describe("maxlength", () => {
      it("should not error on an empty string and maxlegth = 1",
          () => { expect(Validators.maxlength(1)(new Control(""))).toEqual(null); });

      it("should not error on a string shorter than maxlegth",
          () => { expect(Validators.maxlength(2)(new Control("a"))).toEqual(null); });

      it("should not error on a string with length exactly than maxlegth",
          () => { expect(Validators.maxlength(3)(new Control("abc"))).toEqual(null); });

      it("should error on a string longer than maxlegth",
          () => { expect(Validators.maxlength(2)(new Control("abc"))).toEqual({"maxlength": 2 }); });
    });

    describe("compose", () => {
      it("should return a null validator when given null",
         () => { expect(Validators.compose(null)).toBe(Validators.nullValidator); });

      it("should collect errors from all the validators", () => {
        var c = Validators.compose([validator("a", true), validator("b", true)]);
        expect(c(new Control(""))).toEqual({"a": true, "b": true});
      });

      it("should run validators left to right", () => {
        var c = Validators.compose([validator("a", 1), validator("a", 2)]);
        expect(c(new Control(""))).toEqual({"a": 2});
      });

      it("should return null when no errors", () => {
        var c = Validators.compose([Validators.nullValidator, Validators.nullValidator]);
        expect(c(new Control(""))).toEqual(null);
      });
    });

    describe("controlGroupValidator", () => {
      it("should collect errors from the child controls", () => {
        var one = new Control("one", validator("a", true));
        var two = new Control("one", validator("b", true));
        var g = new ControlGroup({"one": one, "two": two});

        expect(Validators.group(g)).toEqual({"a": [one], "b": [two]});
      });

      it("should not include controls that have no errors", () => {
        var one = new Control("one", validator("a", true));
        var two = new Control("two");
        var g = new ControlGroup({"one": one, "two": two});

        expect(Validators.group(g)).toEqual({"a": [one]});
      });

      it("should return null when no errors", () => {
        var g = new ControlGroup({"one": new Control("one")});

        expect(Validators.group(g)).toEqual(null);
      });
    });
  });
}