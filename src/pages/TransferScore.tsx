import { useMemo, useState, type ChangeEvent } from "react";
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

const MAX_REASONABLE_POWER = 1_000_000_000_000;

type SamplePreset = {
  id: string;
  label: string;
  heroTop15: number;
  building: number;
  drone: number;
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

const toInputValue = (value: number) => formatNumber(value);

type ParsedInput = {
  value: number;
  isEmpty: boolean;
  error?: string;
  warning?: string;
};

const parseInput = (raw: string): ParsedInput => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: 0, isEmpty: true };
  }

  const parsed = parsePowerInput(trimmed);
  if (!Number.isFinite(parsed)) {
    return {
      value: 0,
      isEmpty: false,
      error: "Enter a valid non-negative number.",
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
  const [selectedSample, setSelectedSample] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const hero = useMemo(() => parseInput(heroInput), [heroInput]);
  const building = useMemo(() => parseInput(buildingInput), [buildingInput]);
  const drone = useMemo(() => parseInput(droneInput), [droneInput]);

  const anyValueProvided = !hero.isEmpty || !building.isEmpty || !drone.isEmpty;
  const hasErrors = Boolean(hero.error || building.error || drone.error);
  const anyEmpty = hero.isEmpty || building.isEmpty || drone.isEmpty;
  const canEstimate = anyValueProvided && !hasErrors;

  const breakdown = useMemo(
    () =>
      estimateTransferScore({
        heroTop15: hero.value,
        building: building.value,
        drone: drone.value,
      }),
    [hero.value, building.value, drone.value]
  );

  const shareUrl = useMemo(() => {
    if (!canEstimate) {
      return "";
    }
    const params = new URLSearchParams();
    if (!hero.isEmpty) {
      params.set("h", String(hero.value));
    }
    if (!building.isEmpty) {
      params.set("b", String(building.value));
    }
    if (!drone.isEmpty) {
      params.set("d", String(drone.value));
    }

    const baseUrl =
      typeof window !== "undefined" ? window.location.origin : "";
    const path = "/tools/transfer-score";
    const query = params.toString();
    return query ? `${baseUrl}${path}?${query}` : `${baseUrl}${path}`;
  }, [
    canEstimate,
    hero.isEmpty,
    hero.value,
    building.isEmpty,
    building.value,
    drone.isEmpty,
    drone.value,
  ]);

  const handleInputChange =
    (setter: (value: string) => void) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setter(event.target.value);
      if (selectedSample) {
        setSelectedSample("");
      }
    };

  const handleSampleChange = (value: string) => {
    setSelectedSample(value);
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
    setSelectedSample("");
    setCopyStatus("");
    setSearchParams({});
  };

  const handleCopy = async () => {
    if (!shareUrl) {
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setCopyStatus("Copied share link.");
      } else {
        setCopyStatus("Copy not supported. Select the link manually.");
      }
    } catch {
      setCopyStatus("Copy failed. Select the link manually.");
    }
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
                    variant="secondary"
                    onClick={handleCopy}
                    disabled={!shareUrl}
                  >
                    Copy link
                  </Button>
                </div>
                {copyStatus && (
                  <p className="text-xs text-muted-foreground">{copyStatus}</p>
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
                  {!anyValueProvided && <p>Enter values to estimate.</p>}
                  {hasErrors && (
                    <p className="text-destructive">
                      Fix invalid inputs to estimate.
                    </p>
                  )}
                  {canEstimate && anyEmpty && (
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
