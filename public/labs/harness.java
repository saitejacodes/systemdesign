/* Code-lab test harness for Java, appended to the learner's code by lib/labs/bundle.ts.
   A lab's tests.java declares `public class LabTests { public static void main(...) }` and calls T.test(name, input, () -> T.eq(actual, expected)). */
final class T {
    static int passed, total;

    interface Case { void run() throws Exception; }

    static void test(String name, String input, Case c) {
        total++;
        try {
            c.run();
            passed++;
            System.out.println("PASS  " + name);
        } catch (AssertionError e) {
            System.out.println("FAIL  " + name + "\n      input:    " + input + "\n      " + e.getMessage());
        } catch (Throwable e) {
            System.out.println("FAIL  " + name + "\n      input:    " + input + "\n      error:    " + e);
        }
    }

    static String show(Object v) {
        if (v instanceof Object[] a) return java.util.Arrays.deepToString(a);
        if (v instanceof int[] a) return java.util.Arrays.toString(a);
        if (v instanceof long[] a) return java.util.Arrays.toString(a);
        if (v instanceof double[] a) return java.util.Arrays.toString(a);
        if (v instanceof boolean[] a) return java.util.Arrays.toString(a);
        if (v instanceof String s) return '"' + s + '"';
        return String.valueOf(v);
    }

    static void eq(Object actual, Object expected) {
        if (!java.util.Objects.deepEquals(actual, expected))
            throw new AssertionError("expected: " + show(expected) + "\n      actual:   " + show(actual));
    }

    static void approx(double actual, double expected, double tol) {
        if (Math.abs(actual - expected) > tol)
            throw new AssertionError("expected: " + expected + " ± " + tol + "\n      actual:   " + actual);
    }

    static void raises(Class<? extends Throwable> type, Case c) {
        try { c.run(); } catch (Throwable e) {
            if (type.isInstance(e)) return;
            throw new AssertionError("expected: throws " + type.getSimpleName() + "\n      actual:   throws " + e);
        }
        throw new AssertionError("expected: throws " + type.getSimpleName() + "\n      actual:   no exception");
    }

    static void summary() {
        System.out.println("\n" + passed + " / " + total + " passed");
        System.exit(passed == total ? 0 : 1);
    }
}
