import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { COURSE_MODULE } from "../../src/modules/course";
import type CourseModuleService from "../../src/modules/course/service";

jest.setTimeout(180_000);

/**
 * Seam test of online courses (o24-courses): the owner's CRUD, the
 * storefront's locked/unlocked course page, marking a lesson viewed, progress
 * %, and the wall between two shops.
 *
 * Entitlement is granted directly through the course module service
 * (`getContainer().resolve(COURSE_MODULE)`) rather than by driving a real
 * cart-to-payment-capture flow: that flow is `grant-course-on-paid.ts`'s own
 * concern (covered by its unit spec,
 * `src/subscribers/__tests__/grant-course-on-paid.unit.spec.ts`), and
 * reproducing it here would test the checkout, not the course access rules.
 *
 * Runner facts, same as the other specs here: the database is restored from
 * its post-`beforeAll` snapshot before EVERY test, and `DB_HOST` must be the
 * literal `localhost` or the runner forces SSL and nothing connects.
 */
type Registered = {
  token: string;
  tenant: {
    id: string;
    handle: string;
    sales_channel: { id: string };
    api_key: { id: string; token: string };
  };
};

const PASSWORD = "supersecret";
const CUSTOMER_PASSWORD = "supersecret-customer";

const productBody = (title: string) => ({
  title,
  status: "published",
  options: [{ title: "Color", values: ["Blue"] }],
  variants: [
    {
      title,
      prices: [{ currency_code: "eur", amount: 10 }],
      manage_inventory: false,
      options: { Color: "Blue" },
    },
  ],
});

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("o24-courses: courses, lessons, entitlement and progress", () => {
      let a: Registered;
      let b: Registered;
      let productA: { id: string };
      let productB: { id: string };
      let customerA: { id: string; token: string };

      const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

      const storeKey = (owner: Registered, customerToken?: string) => ({
        headers: {
          "x-publishable-api-key": owner.tenant.api_key.token,
          ...(customerToken ? { authorization: `Bearer ${customerToken}` } : {}),
        },
      });

      const failed = (promise: Promise<unknown>) =>
        promise.then(
          (response) => response as { status: number; data: any },
          (error) => error.response as { status: number; data: any },
        );

      const registerTenant = async (handle: string, name: string): Promise<Registered> => {
        const email = `admin@${handle}.test`;
        const registration = await api.post("/auth/tenant/emailpass/register", {
          email,
          password: PASSWORD,
        });
        const created = await api.post(
          "/tenants",
          { name, handle, admin: { email, first_name: name } },
          bearer(registration.data.token),
        );
        expect(created.status).toBe(201);
        const login = await api.post("/auth/tenant/emailpass", { email, password: PASSWORD });
        expect(login.status).toBe(200);
        return { token: login.data.token, tenant: created.data.tenant };
      };

      const createProduct = async (owner: Registered, title: string) => {
        const created = await api.post("/tenants/products", productBody(title), bearer(owner.token));
        expect(created.status).toBe(201);
        return created.data.product as { id: string };
      };

      const registerCustomer = async (owner: Registered, email: string) => {
        const registration = await api.post(
          "/auth/customer/emailpass/register",
          { email, password: CUSTOMER_PASSWORD },
          storeKey(owner),
        );
        const created = await api.post(
          "/store/customers",
          { email, first_name: "Test", last_name: "Buyer" },
          storeKey(owner, registration.data.token),
        );
        expect(created.status).toBe(200);
        const login = await api.post(
          "/auth/customer/emailpass",
          { email, password: CUSTOMER_PASSWORD },
          storeKey(owner),
        );
        return { id: created.data.customer.id as string, token: login.data.token as string };
      };

      const grantEntitlement = async (tenantId: string, customerId: string, courseId: string) => {
        const courseService: CourseModuleService = getContainer().resolve(COURSE_MODULE);
        await courseService.createCourseEntitlements({
          tenant_id: tenantId,
          customer_id: customerId,
          course_id: courseId,
          order_id: null,
          granted_at: new Date(),
          status: "active",
        });
      };

      beforeAll(async () => {
        a = await registerTenant("acme", "Acme");
        b = await registerTenant("globex", "Globex");
        productA = await createProduct(a, "Курс А");
        productB = await createProduct(b, "Курс Б");
        customerA = await registerCustomer(a, "buyer@acme.test");
      });

      it("creates a course and its lessons, refuses a second course on the same product, reorders", async () => {
        const created = await api.post(
          "/tenants/courses",
          { product_id: productA.id, title: "Очищение", description: "Курс о печени" },
          bearer(a.token),
        );
        expect(created.status).toBe(201);
        expect(created.data.course).toMatchObject({
          product_id: productA.id,
          title: "Очищение",
          slug: "ochischenie",
          status: "draft",
        });
        const courseId = created.data.course.id as string;

        const duplicate = await failed(
          api.post("/tenants/courses", { product_id: productA.id, title: "Ещё раз" }, bearer(a.token)),
        );
        expect(duplicate.status).toBe(400);

        const lesson1 = await api.post(
          `/tenants/courses/${courseId}/lessons`,
          { title: "Урок 1", body: "Текст первого урока" },
          bearer(a.token),
        );
        expect(lesson1.status).toBe(201);
        const lesson2 = await api.post(
          `/tenants/courses/${courseId}/lessons`,
          { title: "Урок 2", body: "Текст второго урока", video_url: "https://example.com/v.mp4" },
          bearer(a.token),
        );
        expect(lesson2.status).toBe(201);

        const list = await api.get(`/tenants/courses/${courseId}/lessons`, bearer(a.token));
        expect(list.data.lessons.map((l: any) => l.title)).toEqual(["Урок 1", "Урок 2"]);

        const reordered = await api.post(
          `/tenants/courses/${courseId}/lessons/reorder`,
          { ids: [lesson2.data.lesson.id, lesson1.data.lesson.id] },
          bearer(a.token),
        );
        expect(reordered.status).toBe(200);
        expect(reordered.data.lessons.map((l: any) => l.title)).toEqual(["Урок 2", "Урок 1"]);

        const published = await api.post(
          `/tenants/courses/${courseId}`,
          { status: "published" },
          bearer(a.token),
        );
        expect(published.data.course.status).toBe("published");
      });

      it("keeps two shops apart: course, lesson and CRUD are all 404 across tenants", async () => {
        const created = await api.post(
          "/tenants/courses",
          { product_id: productA.id, title: "Изоляция" },
          bearer(a.token),
        );
        const courseId = created.data.course.id as string;

        const foreignRead = await failed(api.get(`/tenants/courses/${courseId}`, bearer(b.token)));
        expect(foreignRead.status).toBe(404);

        const foreignUpdate = await failed(
          api.post(`/tenants/courses/${courseId}`, { title: "Захват" }, bearer(b.token)),
        );
        expect(foreignUpdate.status).toBe(404);

        const foreignDelete = await failed(api.delete(`/tenants/courses/${courseId}`, bearer(b.token)));
        expect(foreignDelete.status).toBe(404);

        // A course cannot be created against another tenant's product either.
        const crossCreate = await failed(
          api.post("/tenants/courses", { product_id: productB.id, title: "Чужой" }, bearer(a.token)),
        );
        expect(crossCreate.status).toBe(404);

        const list = await api.get("/tenants/courses", bearer(b.token));
        expect(list.data.courses.find((c: any) => c.id === courseId)).toBeUndefined();
      });

      it("shows a locked course page to an anonymous visitor and unlocks it once the customer is entitled", async () => {
        const created = await api.post(
          "/tenants/courses",
          { product_id: productA.id, title: "Прогресс курс" },
          bearer(a.token),
        );
        const courseId = created.data.course.id as string;
        await api.post(`/tenants/courses/${courseId}`, { status: "published" }, bearer(a.token));
        const l1 = await api.post(
          `/tenants/courses/${courseId}/lessons`,
          { title: "Введение", body: "Первый текст урока" },
          bearer(a.token),
        );
        const l2 = await api.post(
          `/tenants/courses/${courseId}/lessons`,
          { title: "Практика", body: "Второй текст урока" },
          bearer(a.token),
        );

        const locked = await api.get(`/store/tenant/courses?product_id=${productA.id}`, storeKey(a));
        expect(locked.status).toBe(200);
        expect(locked.data.has_access).toBe(false);
        expect(locked.data.progress).toBeNull();
        expect(locked.data.lessons).toEqual([
          { id: l1.data.lesson.id, title: "Введение", order: 0, locked: true },
          { id: l2.data.lesson.id, title: "Практика", order: 1, locked: true },
        ]);

        // Nobody, logged in or not, reads lesson content without an entitlement.
        const anonymousLesson = await failed(
          api.get(`/store/tenant/courses/${courseId}/lessons/${l1.data.lesson.id}`, storeKey(a)),
        );
        expect(anonymousLesson.status).toBe(401);

        const deniedLesson = await failed(
          api.get(
            `/store/tenant/courses/${courseId}/lessons/${l1.data.lesson.id}`,
            storeKey(a, customerA.token),
          ),
        );
        expect(deniedLesson.status).toBe(403);

        await grantEntitlement(a.tenant.id, customerA.id, courseId);

        const unlocked = await api.get(
          `/store/tenant/courses?product_id=${productA.id}`,
          storeKey(a, customerA.token),
        );
        expect(unlocked.data.has_access).toBe(true);
        expect(unlocked.data.lessons.every((l: any) => l.locked === false)).toBe(true);
        expect(unlocked.data.progress).toEqual({ completed: 0, total: 2, percent: 0 });

        const lessonContent = await api.get(
          `/store/tenant/courses/${courseId}/lessons/${l1.data.lesson.id}`,
          storeKey(a, customerA.token),
        );
        expect(lessonContent.status).toBe(200);
        expect(lessonContent.data.lesson).toMatchObject({
          title: "Введение",
          body: "Первый текст урока",
          viewed_at: null,
        });

        const marked = await api.post(
          `/store/tenant/courses/${courseId}/lessons/${l1.data.lesson.id}/viewed`,
          {},
          storeKey(a, customerA.token),
        );
        expect(marked.status).toBe(200);
        expect(marked.data.progress).toEqual({ completed: 1, total: 2, percent: 50 });

        // Idempotent: marking the same lesson again does not inflate progress.
        const markedAgain = await api.post(
          `/store/tenant/courses/${courseId}/lessons/${l1.data.lesson.id}/viewed`,
          {},
          storeKey(a, customerA.token),
        );
        expect(markedAgain.data.progress).toEqual({ completed: 1, total: 2, percent: 50 });

        const mine = await api.get("/store/tenant/courses/mine", storeKey(a, customerA.token));
        expect(mine.status).toBe(200);
        const mineEntry = mine.data.courses.find((c: any) => c.id === courseId);
        expect(mineEntry).toMatchObject({ progress: { completed: 1, total: 2, percent: 50 } });
      });
    });
  },
});
