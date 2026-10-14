import { describe, expect, it } from "vitest";
import { STUDENTS_PER_PAGE, lastPage, likeContains, pageRange, parseStudentFilters, studentsHref } from "@/lib/studentFilters";

const teachers = ["t1", "t2"];

describe("parseStudentFilters", () => {
  it("reads good filters", () => {
    expect(parseStudentFilters({ q: " Ama ", level: "2", teacher: "t2", page: "3" }, teachers)).toEqual({ q: "Ama", level: 2, teacher: "t2", page: 3 });
  });

  it("ignores a level, teacher or page that doesn't make sense", () => {
    expect(parseStudentFilters({ level: "99", teacher: "stranger", page: "-4" }, teachers)).toEqual({ q: "", level: null, teacher: null, page: 1 });
    expect(parseStudentFilters({ level: "abc", page: "x" }, teachers)).toMatchObject({ level: null, page: 1 });
    expect(parseStudentFilters({}, teachers)).toEqual({ q: "", level: null, teacher: null, page: 1 });
  });

  it("takes the first of a repeated parameter and caps the search length", () => {
    expect(parseStudentFilters({ q: ["a", "b"] }, teachers).q).toBe("a");
    expect(parseStudentFilters({ q: "x".repeat(500) }, teachers).q).toHaveLength(80);
  });
});

describe("likeContains", () => {
  it("matches a name anywhere, with typed wildcards taken literally", () => {
    expect(likeContains("ama")).toBe("%ama%");
    expect(likeContains("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});

describe("pages", () => {
  it("gives each page its rows, and the last page that has anyone", () => {
    expect(pageRange(1)).toEqual([0, STUDENTS_PER_PAGE - 1]);
    expect(pageRange(3)).toEqual([2 * STUDENTS_PER_PAGE, 3 * STUDENTS_PER_PAGE - 1]);
    expect(lastPage(0)).toBe(1);
    expect(lastPage(STUDENTS_PER_PAGE)).toBe(1);
    expect(lastPage(STUDENTS_PER_PAGE + 1)).toBe(2);
  });
});

describe("studentsHref", () => {
  it("keeps only what is set", () => {
    expect(studentsHref({ q: "", level: null, teacher: null })).toBe("/admin/students");
    expect(studentsHref({ q: "ama", level: 1, teacher: "t1", page: 2 })).toBe("/admin/students?q=ama&level=1&teacher=t1&page=2");
    expect(studentsHref({ q: "", level: null, teacher: null, page: 1 })).toBe("/admin/students");
  });
});
