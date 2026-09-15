/**
 * Negative control taken from the real repository (this comment is the one
 * that made the first version of the detector red on production code): the
 * word "throwaway" here describes a DATABASE the step has to cope with, not
 * the file. A bare adjective is not evidence about a file's purpose.
 *
 * A bare backend — a throwaway integration-test database migrated without the
 * seed — has no shipping profile, so the step creates a default one.
 */
export const resolveDefaultShippingProfile = () => ({ id: "sp_default" });
