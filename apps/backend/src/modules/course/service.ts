import { MedusaService } from "@medusajs/framework/utils";
import Course from "./models/course";
import Lesson from "./models/lesson";
import CourseEntitlement from "./models/course-entitlement";
import CourseProgress from "./models/course-progress";

class CourseModuleService extends MedusaService({
  Course,
  Lesson,
  CourseEntitlement,
  CourseProgress,
}) {}

export default CourseModuleService;
