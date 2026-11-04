import { describe, expect, it } from "vitest";
import { maskProfanity } from "./profanity";

describe("maskProfanity", () => {
  it("masks English bad words, any case", () => {
    expect(maskProfanity("what the FUCK")).toBe("what the ***");
    expect(maskProfanity("Shit happens")).toBe("*** happens");
  });

  it("masks suffixed forms, stretched letters and look-alike characters", () => {
    expect(maskProfanity("fucking move")).toBe("*** move");
    expect(maskProfanity("fuuuuck")).toBe("***");
    expect(maskProfanity("you b1tch")).toBe("you ***");
    expect(maskProfanity("$hit")).toBe("***");
  });

  it("masks Hinglish words", () => {
    expect(maskProfanity("abe chutiya")).toBe("abe ***");
    expect(maskProfanity("bhenchod kya move tha")).toBe("*** kya move tha");
    expect(maskProfanity("MC BC")).toBe("*** ***");
    expect(maskProfanity("gandu")).toBe("***");
  });

  it("masks Devanagari words", () => {
    expect(maskProfanity("तू चूतिया है")).toBe("तू *** है");
    expect(maskProfanity("हरामी")).toBe("***");
  });

  it("keeps punctuation and emoji around masked words", () => {
    expect(maskProfanity("shit!! 😂")).toBe("***!! 😂");
    expect(maskProfanity("(fuck)")).toBe("(***)");
  });

  it("does not mask innocent words that contain a bad word", () => {
    for (const ok of ["class", "assignment", "bass", "passed", "shell", "Scunthorpe", "cockpit", "mcdonalds", "abc", "Dickens", "grandmaster", "chutney"])
      expect(maskProfanity(ok)).toBe(ok);
  });

  it("returns clean text unchanged", () => {
    const s = "Good game! Rematch? 🤝";
    expect(maskProfanity(s)).toBe(s);
  });
});
