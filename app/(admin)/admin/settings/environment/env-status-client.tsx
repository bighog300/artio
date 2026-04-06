"use client";

import { Fragment } from "react";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EnvVarDefinition } from "./env-definitions";

type EnvStatusClientProps = {
  definitions: EnvVarDefinition[];
  statusMap: Record<string, boolean>;
};

export default function EnvStatusClient({ definitions, statusMap }: EnvStatusClientProps) {
  const total = definitions.length;
  const configuredCount = definitions.filter((def) => statusMap[def.key]).length;
  const requiredMissingCount = definitions.filter((def) => def.required && !statusMap[def.key]).length;

  const groupedDefinitions = definitions.reduce<Record<string, EnvVarDefinition[]>>((acc, def) => {
    if (!acc[def.category]) {
      acc[def.category] = [];
    }

    acc[def.category].push(def);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Environment Variables"
        description="Read-only status of all environment variables. Values are never shown."
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <Badge variant="outline" className="text-sm">
            {configuredCount} / {total} configured
          </Badge>
          <Badge
            variant={requiredMissingCount > 0 ? "destructive" : "secondary"}
            className="text-sm"
          >
            {requiredMissingCount} required missing
          </Badge>
          {requiredMissingCount === 0 ? (
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">All required vars set</Badge>
          ) : null}
        </CardContent>
      </Card>

      {Object.entries(groupedDefinitions).map(([category, vars]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-lg">{category}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variable</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requirement</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vars.map((def) => {
                  const isSet = statusMap[def.key];
                  const showWarning = def.required && !isSet && def.missingWarning;

                  return (
                    <Fragment key={def.key}>
                      <TableRow>
                        <TableCell className="font-mono text-xs sm:text-sm">{def.key}</TableCell>
                        <TableCell>
                          <Badge
                            className={isSet ? "bg-emerald-600 text-white hover:bg-emerald-600" : undefined}
                            variant={isSet ? "default" : "destructive"}
                          >
                            {isSet ? "Set" : "Not set"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={def.required ? "destructive" : "secondary"}>
                            {def.required ? "Required" : "Optional"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{def.description}</TableCell>
                      </TableRow>
                      {showWarning ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={4} className="pt-0 text-sm text-amber-700">
                            Missing requirement: {def.missingWarning}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
