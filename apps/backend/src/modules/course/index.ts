import { Module } from "@medusajs/framework/utils";
import CourseModuleService from "./service";

export const COURSE_MODULE = "course";

export default Module(COURSE_MODULE, {
  service: CourseModuleService,
});
