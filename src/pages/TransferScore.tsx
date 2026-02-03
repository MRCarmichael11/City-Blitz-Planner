import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  TRANSFER_SCORE_COEFFICIENTS,
  TRANSFER_SCORE_VERSION,
  estimateTransferScore,
  parsePowerInput,
} from "@/lib/transferScore";

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const MAX_REASONABLE_POWER = 1_000_000_000_000;

type SamplePreset = {
  id: string;
  label: string;
  heroTop15: number;
  building: number;
  drone: number;
};

type CutoffSample = {
  season: number;
  bracketSize: number;
  surge: string;
  silverMax: number;
  blueMax: number;
  purpleMax: number;
  notes?: string;
};

type CutoffStats = {
  min: number;
  max: number;
  median: number;
};

const samplePresets: SamplePreset[] = [
  {
    id: "you",
    label: "You",
    heroTop15: 150_200_000,
    building: 16_661_996,
    drone: 12_737_545,
  },
  {
    id: "rn",
    label: "RN",
    heroTop15: 153_000_000,
    building: 22_381_146,
    drone: 12_986_980,
  },
  {
    id: "panda",
    label: "Panda",
    heroTop15: 140_900_000,
    building: 19_579_800,
    drone: 11_186_420,
  },
  {
    id: "kami",
    label: "Kami",
    heroTop15: 122_500_000,
    building: 15_591_578,
    drone: 9_389_358,
  },
];

const formatNumber = (value: number) =>
  numberFormatter.format(Math.round(value));

const formatCompact = (value: number) =>
  compactFormatter.format(Math.round(value));

const formatRange = (stats: CutoffStats) =>
  `${formatCompact(stats.min)} - ${formatCompact(stats.max)} (median ${formatCompact(
    stats.median
  )})`;

const toInputValue = (value: number) => formatNumber(value);

type ParsedInput = {
  value: number;
  isEmpty: boolean;
  error?: string;
  warning?: string;
};

const parseInput = (
  raw: string,
  errorMessage = "Enter a valid non-negative number."
): ParsedInput => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: 0, isEmpty: true };
  }

  const parsed = parsePowerInput(trimmed);
  if (!Number.isFinite(parsed)) {
    return {
      value: 0,
      isEmpty: false,
      error: errorMessage,
    };
  }

  return {
    value: parsed,
    isEmpty: false,
    warning:
      parsed > MAX_REASONABLE_POWER
        ? "Value seems unusually large (> 1e12)."
        : undefined,
  };
};

const addParam = (
  params: URLSearchParams,
  key: string,
  parsed: ParsedInput
) => {
  if (!parsed.isEmpty && !parsed.error) {
    params.set(key, String(parsed.value));
  }
};

const getMedian = (values: number[]) => {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const getStats = (values: number[]): CutoffStats | null => {
  if (!values.length) {
    return null;
  }
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    median: getMedian(values),
  };
};

const TransferScore = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [heroInput, setHeroInput] = useState(
    () => searchParams.get("h") ?? ""
  );
  const [buildingInput, setBuildingInput] = useState(
    () => searchParams.get("b") ?? ""
  );
  const [droneInput, setDroneInput] = useState(
    () => searchParams.get("d") ?? ""
  );
  const [silverInput, setSilverInput] = useState(
    () => searchParams.get("silverMax") ?? ""
  );
  const [blueInput, setBlueInput] = useState(
    () => searchParams.get("blueMax") ?? ""
  );
  const [purpleInput, setPurpleInput] = useState(
    () => searchParams.get("purpleMax") ?? ""
  );
  const [selectedSample, setSelectedSample] = useState("");
  const [linkStatus, setLinkStatus] = useState("");
  const [bracketSelection, setBracketSelection] = useState("64");
  const [customBracket, setCustomBracket] = useState("");
  const [cutoffSamples, setCutoffSamples] = useState<CutoffSample[]>([]);
  const [cutoffLoadError, setCutoffLoadError] = useState("");
  const [isCutoffLoading, setIsCutoffLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadCutoffs = async () => {
      try {
        const response = await fetch("/data/transferCutoffs.json");
        if (!response.ok) {
          throw new Error("Failed to load cutoff history.");
        }
        const data = (await response.json()) as CutoffSample[];
        if (active) {
          setCutoffSamples(Array.isArray(data) ? data : []);
          setCutoffLoadError("");
        }
      } catch (error) {
        if (active) {
          setCutoffSamples([]);
          setCutoffLoadError(
            error instanceof Error ? error.message : "Failed to load cutoffs."
          );
        }
      } finally {
        if (active) {
          setIsCutoffLoading(false);
        }
      }
    };

    loadCutoffs();

    return () => {
      active = false;
    };
  }, []);

  const hero = useMemo(() => parseInput(heroInput), [heroInput]);
  const building = useMemo(() => parseInput(buildingInput), [buildingInput]);
  const drone = useMemo(() => parseInput(droneInput), [droneInput]);
  const silver = useMemo(
    () => parseInput(silverInput, "Enter a valid non-negative cutoff."),
    [silverInput]
  );
  const blue = useMemo(
    () => parseInput(blueInput, "Enter a valid non-negative cutoff."),
    [blueInput]
  );
  const purple = useMemo(
    () => parseInput(purpleInput, "Enter a valid non-negative cutoff."),
    [purpleInput]
  );

  const anyEstimateValueProvided =
    !hero.isEmpty || !building.isEmpty || !drone.isEmpty;
  const hasEstimateErrors = Boolean(
    hero.error || building.error || drone.error
  );
  const anyEstimateEmpty = hero.isEmpty || building.isEmpty || drone.isEmpty;
  const canEstimate = anyEstimateValueProvided && !hasEstimateErrors;

  const breakdown = useMemo(
    () =>
      estimateTransferScore({
        heroTop15: hero.value,
        building: building.value,
        drone: drone.value,
      }),
    [hero.value, building.value, drone.value]
  );

  const shareParams = useMemo(() => {
    const params = new URLSearchParams();
    addParam(params, "h", hero);
    addParam(params, "b", building);
    addParam(params, "d", drone);
    addParam(params, "silverMax", silver);
    addParam(params, "blueMax", blue);
    addParam(params, "purpleMax", purple);
    return params;
  }, [hero, building, drone, silver, blue, purple]);

  const shareQuery = shareParams.toString();
  const canShare = Boolean(shareQuery);
  const shareUrl = useMemo(() => {
    if (!shareQuery) {
      return "";
    }
    const baseUrl =
      typeof window !== "undefined" ? window.location.origin : "";
    const path = "/tools/transfer-score";
    return `${baseUrl}${path}?${shareQuery}`;
  }, [shareQuery]);

  const bracketSize =
    bracketSelection === "other"
      ? Number.parseInt(customBracket, 10)
      : Number(bracketSelection);
  const bracketHasError =
    bracketSelection === "other" &&
    (!customBracket.trim() ||
      !Number.isFinite(bracketSize) ||
      bracketSize <= 0);
  const bracketIsValid = Number.isFinite(bracketSize) && bracketSize > 0;

  const filteredCutoffs = useMemo(() => {
    if (!bracketIsValid) {
      return [];
    }
    return cutoffSamples.filter(
      (sample) => sample.bracketSize === bracketSize
    );
  }, [cutoffSamples, bracketIsValid, bracketSize]);

  const cutoffStats = useMemo(() => {
    if (!bracketIsValid || filteredCutoffs.length === 0) {
      return null;
    }
    const silverStats = getStats(
      filteredCutoffs.map((sample) => sample.silverMax)
    );
    const blueStats = getStats(
      filteredCutoffs.map((sample) => sample.blueMax)
    );
    const purpleStats = getStats(
      filteredCutoffs.map((sample) => sample.purpleMax)
    );
    if (!silverStats || !blueStats || !purpleStats) {
      return null;
    }
    return {
      silver: silverStats,
      blue: blueStats,
      purple: purpleStats,
    };
  }, [bracketIsValid, filteredCutoffs]);

  const handleInputChange =
    (setter: (value: string) => void) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setter(event.target.value);
      setLinkStatus("");
      if (selectedSample) {
        setSelectedSample("");
      }
    };

  const handleSampleChange = (value: string) => {
    setSelectedSample(value);
    setLinkStatus("");
    const preset = samplePresets.find((item) => item.id === value);
    if (!preset) {
      return;
    }
    setHeroInput(toInputValue(preset.heroTop15));
    setBuildingInput(toInputValue(preset.building));
    setDroneInput(toInputValue(preset.drone));
  };

  const handleReset = () => {
    setHeroInput("");
    setBuildingInput("");
    setDroneInput("");
    setSilverInput("");
    setBlueInput("");
    setPurpleInput("");
    setSelectedSample("");
    setLinkStatus("");
    setSearchParams({});
  };

  const handleUpdateUrl = () => {
    if (shareQuery) {
      setSearchParams(shareParams);
      setLinkStatus("URL updated.");
    } else {
      setSearchParams({});
      setLinkStatus("URL cleared.");
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) {
      return;
    }
    setSearchParams(shareParams);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setLinkStatus("Copied share link.");
      } else {
        setLinkStatus("Copy not supported. Select the link manually.");
      }
    } catch {
      setLinkStatus("Copy failed. Select the link manually.");
    }
  };

  const handleUseMedianCutoffs = () => {
    if (!cutoffStats) {
      return;
    }
    setSilverInput(toInputValue(Math.round(cutoffStats.silver.median)));
    setBlueInput(toInputValue(Math.round(cutoffStats.blue.median)));
    setPurpleInput(toInputValue(Math.round(cutoffStats.purple.median)));
    setLinkStatus("Median cutoffs applied (example defaults).");
  };

  const scoreDisplay = canEstimate ? formatNumber(breakdown.score) : "0";
  const heroContributionDisplay = canEstimate
    ? formatNumber(breakdown.heroContribution)
    : "0";
  const buildingContributionDisplay = canEstimate
    ? formatNumber(breakdown.buildingContribution)
    : "0";
  const droneContributionDisplay = canEstimate
    ? formatNumber(breakdown.droneContribution)
    : "0";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">
            Transfer Surge Score Calculator
          </h1>
          <p className="text-sm text-muted-foreground">
            Estimate transfer score using persistent, non-seasonal power stats.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Inputs</CardTitle>
              <CardDescription>
                Accepts commas, spaces, and k/m/b suffixes (case-insensitive).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Sample inputs</Label>
                <Select value={selectedSample} onValueChange={handleSampleChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a sample player" />
                  </SelectTrigger>
                  <SelectContent>
                    {samplePresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="hero-power">
                    3v3 / Top-15 Hero Power (H)
                  </Label>
                  <Input
                    id="hero-power"
                    value={heroInput}
                    onChange={handleInputChange(setHeroInput)}
                    placeholder="e.g. 150.2m or 150,200,000"
                    inputMode="decimal"
                    className={cn(
                      hero.error
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    )}
                  />
                  {hero.error && (
                    <p className="text-xs text-destructive">{hero.error}</p>
                  )}
                  {!hero.error && hero.warning && (
                    <p className="text-xs text-amber-400">{hero.warning}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="building-power">Building Power (B)</Label>
                  <Input
                    id="building-power"
                    value={buildingInput}
                    onChange={handleInputChange(setBuildingInput)}
                    placeholder="e.g. 16,662,000 or 16.7m"
                    inputMode="decimal"
                    className={cn(
                      building.error
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    )}
                  />
                  {building.error && (
                    <p className="text-xs text-destructive">
                      {building.error}
                    </p>
                  )}
                  {!building.error && building.warning && (
                    <p className="text-xs text-amber-400">
                      {building.warning}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drone-power">Drone Power (D)</Label>
                  <Input
                    id="drone-power"
                    value={droneInput}
                    onChange={handleInputChange(setDroneInput)}
                    placeholder="e.g. 12,737,545 or 12.7m"
                    inputMode="decimal"
                    className={cn(
                      drone.error
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    )}
                  />
                  {drone.error && (
                    <p className="text-xs text-destructive">{drone.error}</p>
                  )}
                  {!drone.error && drone.warning && (
                    <p className="text-xs text-amber-400">{drone.warning}</p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleReset}>
                  Reset
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Share link</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    readOnly
                    value={shareUrl}
                    placeholder="Enter values to generate a share link"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUpdateUrl}
                    disabled={!canShare}
                  >
                    Update URL
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCopy}
                    disabled={!canShare}
                  >
                    Copy link
                  </Button>
                </div>
                {linkStatus && (
                  <p className="text-xs text-muted-foreground">{linkStatus}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
              <CardDescription>
                Computed from Hero (H), Building (B), and Drone (D) power only.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Estimated transfer score
                    </p>
                    <p className="text-3xl font-semibold">{scoreDisplay}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {!anyEstimateValueProvided && (
                    <p>Enter values to estimate.</p>
                  )}
                  {hasEstimateErrors && (
                    <p className="text-destructive">
                      Fix invalid inputs to estimate.
                    </p>
                  )}
                  {canEstimate && anyEstimateEmpty && (
                    <p>Empty fields are treated as 0.</p>
                  )}
                  {canEstimate && (
                    <p>Typical observed error: ~+/- 175k.</p>
                  )}
                </div>
              </div>

              <div className="rounded-md border bg-background p-4">
                <p className="mb-3 text-sm font-medium">Breakdown</p>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center justify-between">
                    <span>Base</span>
                    <span>{formatNumber(breakdown.base)}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>
                      Hero contribution ({formatNumber(
                        TRANSFER_SCORE_COEFFICIENTS.hero
                      )}{" "}
                      x H)
                    </span>
                    <span>{heroContributionDisplay}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>
                      Building contribution ({formatNumber(
                        TRANSFER_SCORE_COEFFICIENTS.building
                      )}{" "}
                      x B)
                    </span>
                    <span>{buildingContributionDisplay}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span>
                      Drone contribution ({formatNumber(
                        TRANSFER_SCORE_COEFFICIENTS.drone
                      )}{" "}
                      x D)
                    </span>
                    <span>{droneContributionDisplay}</span>
                  </li>
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  H, B, and D are each power divided by 1,000,000.
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                Estimator {TRANSFER_SCORE_VERSION} (community reverse-engineered).
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Advanced: Cutoffs &amp; Forecast</CardTitle>
            <CardDescription>
              Cutoffs vary by bracket and surge; defaults are example values, not
              authoritative.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                These cutoffs are informational only and do not affect the score
                estimate.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="silver-cutoff">Silver max</Label>
                <Input
                  id="silver-cutoff"
                  value={silverInput}
                  onChange={handleInputChange(setSilverInput)}
                  placeholder="e.g. 420k or 420,000"
                  inputMode="decimal"
                  className={cn(
                    silver.error
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  )}
                />
                {silver.error && (
                  <p className="text-xs text-destructive">{silver.error}</p>
                )}
                {!silver.error && silver.warning && (
                  <p className="text-xs text-amber-400">{silver.warning}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="blue-cutoff">Blue max</Label>
                <Input
                  id="blue-cutoff"
                  value={blueInput}
                  onChange={handleInputChange(setBlueInput)}
                  placeholder="e.g. 1.2m or 1,200,000"
                  inputMode="decimal"
                  className={cn(
                    blue.error
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  )}
                />
                {blue.error && (
                  <p className="text-xs text-destructive">{blue.error}</p>
                )}
                {!blue.error && blue.warning && (
                  <p className="text-xs text-amber-400">{blue.warning}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="purple-cutoff">Purple max</Label>
                <Input
                  id="purple-cutoff"
                  value={purpleInput}
                  onChange={handleInputChange(setPurpleInput)}
                  placeholder="e.g. 3.8m or 3,800,000"
                  inputMode="decimal"
                  className={cn(
                    purple.error
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  )}
                />
                {purple.error && (
                  <p className="text-xs text-destructive">{purple.error}</p>
                )}
                {!purple.error && purple.warning && (
                  <p className="text-xs text-amber-400">{purple.warning}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleUpdateUrl}
                disabled={!canShare}
              >
                Save cutoffs to URL
              </Button>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Bracket size</Label>
                <Select
                  value={bracketSelection}
                  onValueChange={setBracketSelection}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select bracket size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="32">32</SelectItem>
                    <SelectItem value="64">64</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {bracketSelection === "other" && (
                <div className="space-y-2">
                  <Label htmlFor="custom-bracket">Custom bracket size</Label>
                  <Input
                    id="custom-bracket"
                    value={customBracket}
                    onChange={handleInputChange(setCustomBracket)}
                    placeholder="Enter bracket size"
                    inputMode="numeric"
                    className={cn(
                      bracketHasError
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    )}
                  />
                  {bracketHasError && (
                    <p className="text-xs text-destructive">
                      Enter a valid bracket size.
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-md border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Estimated cutoffs (rough)
                  </p>
                  {!isCutoffLoading && !cutoffLoadError && bracketIsValid && (
                    <p className="text-xs text-muted-foreground">
                      Samples: {filteredCutoffs.length}
                    </p>
                  )}
                </div>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {isCutoffLoading && <p>Loading historical cutoffs...</p>}
                  {!isCutoffLoading && cutoffLoadError && (
                    <p className="text-destructive">{cutoffLoadError}</p>
                  )}
                  {!isCutoffLoading &&
                    !cutoffLoadError &&
                    bracketHasError && (
                      <p className="text-destructive">
                        Enter a valid bracket size to forecast.
                      </p>
                    )}
                  {!isCutoffLoading &&
                    !cutoffLoadError &&
                    bracketIsValid &&
                    filteredCutoffs.length === 0 && (
                      <p>No historical samples for this bracket size.</p>
                    )}
                  {!isCutoffLoading &&
                    !cutoffLoadError &&
                    cutoffStats && (
                      <ul className="space-y-1 text-sm text-foreground">
                        <li className="flex items-center justify-between">
                          <span>Silver</span>
                          <span>{formatRange(cutoffStats.silver)}</span>
                        </li>
                        <li className="flex items-center justify-between">
                          <span>Blue</span>
                          <span>{formatRange(cutoffStats.blue)}</span>
                        </li>
                        <li className="flex items-center justify-between">
                          <span>Purple</span>
                          <span>{formatRange(cutoffStats.purple)}</span>
                        </li>
                      </ul>
                    )}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Forecast based on historical community-reported cutoffs; actual
                  values may vary.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleUseMedianCutoffs}
                  disabled={!cutoffStats}
                >
                  Use median as my cutoffs
                </Button>
                <p className="text-xs text-muted-foreground">
                  Forecast is informational only and never overrides your
                  entries.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Explanation</CardTitle>
            <CardDescription>Model assumptions and disclaimers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              This estimate intentionally ignores Unit Power, Tactics, and Tech
              for the reasons above.
            </p>
            <p>Expect variance; this is an empirical model.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TransferScore;
